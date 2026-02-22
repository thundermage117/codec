/*
 * Codec Explorer: An interactive codec laboratory.
 * Copyright (C) 2026 Abhinav Tanniru
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */
#include "wavelet.h"
#include <algorithm>
#include <cmath>
#include <vector>

static const double SQRT2 = 1.41421356237309504880;
static const double INV_SQRT2 = 0.70710678118654752440; // 1.0 / sqrt(2)

/*
 * Forward 1D orthonormal Haar wavelet transform in-place on `n` elements.
 * Produces averages in [0..n/2-1] and differences in [n/2..n-1].
 *   avg[k] = (data[2k] + data[2k+1]) / sqrt(2)
 *   det[k] = (data[2k] - data[2k+1]) / sqrt(2)
 */
static void haar1d_fwd(double* data, int n) {
    double tmp[8];
    int half = n / 2;
    for (int k = 0; k < half; ++k) {
        tmp[k]        = (data[2*k] + data[2*k+1]) * INV_SQRT2;
        tmp[k + half] = (data[2*k] - data[2*k+1]) * INV_SQRT2;
    }
    for (int k = 0; k < n; ++k) data[k] = tmp[k];
}

/*
 * Inverse 1D orthonormal Haar wavelet transform in-place on `n` elements.
 * Reconstructs the original signal from averages in [0..n/2-1] and
 * differences in [n/2..n-1].
 *   x[2k]   = (avg[k] + det[k]) / sqrt(2)
 *   x[2k+1] = (avg[k] - det[k]) / sqrt(2)
 */
static void haar1d_inv(double* data, int n) {
    double tmp[8];
    int half = n / 2;
    for (int k = 0; k < half; ++k) {
        tmp[2*k]     = (data[k] + data[k + half]) * INV_SQRT2;
        tmp[2*k + 1] = (data[k] - data[k + half]) * INV_SQRT2;
    }
    for (int k = 0; k < n; ++k) data[k] = tmp[k];
}

/*
 * Forward 2D Haar DWT on an 8x8 block.
 * Uses 3-level multi-resolution decomposition: applies separable 1D Haar
 * transforms to rows then columns, iterating down from size=8 to size=2.
 *
 * Coefficient layout after full decomposition:
 *   [0][0]         — LL3 (DC, coarsest approximation)
 *   [0][1],[1][0],[1][1] — HL3, LH3, HH3 (finest-scale detail at level 3)
 *   [0][2..3], ...  — level-2 details
 *   [0][4..7], ...  — level-1 details
 */
void dwt8x8(const double src[8][8], double dst[8][8]) {
    double tmp[8][8];
    for (int i = 0; i < 8; ++i)
        for (int j = 0; j < 8; ++j)
            tmp[i][j] = src[i][j];

    int size = 8;
    while (size >= 2) {
        // Forward Haar on each row (first `size` columns)
        for (int i = 0; i < size; ++i)
            haar1d_fwd(tmp[i], size);

        // Forward Haar on each column (first `size` rows)
        for (int j = 0; j < size; ++j) {
            double col[8];
            for (int i = 0; i < size; ++i) col[i] = tmp[i][j];
            haar1d_fwd(col, size);
            for (int i = 0; i < size; ++i) tmp[i][j] = col[i];
        }

        size /= 2;
    }

    for (int i = 0; i < 8; ++i)
        for (int j = 0; j < 8; ++j)
            dst[i][j] = tmp[i][j];
}

/*
 * Inverse 2D Haar DWT on an 8x8 block.
 * Reverses the forward transform: starts from the coarsest level (size=2)
 * and iterates up to size=8, applying inverse 1D Haar to columns then rows.
 */
void idwt8x8(const double src[8][8], double dst[8][8]) {
    double tmp[8][8];
    for (int i = 0; i < 8; ++i)
        for (int j = 0; j < 8; ++j)
            tmp[i][j] = src[i][j];

    int size = 2;
    while (size <= 8) {
        // Inverse Haar on each column first (undo column step of forward pass)
        for (int j = 0; j < size; ++j) {
            double col[8];
            for (int i = 0; i < size; ++i) col[i] = tmp[i][j];
            haar1d_inv(col, size);
            for (int i = 0; i < size; ++i) tmp[i][j] = col[i];
        }

        // Inverse Haar on each row (undo row step of forward pass)
        for (int i = 0; i < size; ++i)
            haar1d_inv(tmp[i], size);

        size *= 2;
    }

    for (int i = 0; i < 8; ++i)
        for (int j = 0; j < 8; ++j)
            dst[i][j] = tmp[i][j];
}

// -----------------------------------------------------------------------
// Full-image DWT helpers & Statistics
// -----------------------------------------------------------------------

/*
 * Estimates the number of bits required to encode the DWT coefficients
 * in `data` after quantization. This is a simple entropy-based estimate:
 * - Zero coefficients are very cheap (part of a run).
 * - Non-zero coefficients are estimated based on their magnitude.
 */
double dwtEstimateBits(const double* data, int width, int height) {
    double totalBits = 0;
    size_t count = (size_t)width * height;
    
    // Very simple model: 
    // - Each zero-run is roughly 1-2 bits per zero.
    // - Each non-zero coeff takes ~log2(abs(val)) + sign + overhead.
    for (size_t i = 0; i < count; ++i) {
        double val = std::abs(data[i]);
        if (val < 0.5) {
            totalBits += 0.5; // Roughly 0.5 bits per zero on average (JPEG-like)
        } else {
            // log2(val) bits + 1 sign bit + 2 bits overhead
            totalBits += std::log2(val) + 3.0;
        }
    }
    
    // Add some constant header overhead (roughly 400 bits)
    return totalBits + 400.0;
}

/*
 * Forward 1D orthonormal Haar on n elements (arbitrary even n), in-place.
 * Identical math to haar1d_fwd but uses a heap buffer for any length.
 */
static void haar1d_fwd_n(double* data, int n) {
    std::vector<double> tmp(n);
    int half = n / 2;
    for (int k = 0; k < half; ++k) {
        tmp[k]        = (data[2*k]     + data[2*k + 1]) * INV_SQRT2;
        tmp[k + half] = (data[2*k]     - data[2*k + 1]) * INV_SQRT2;
    }
    for (int k = 0; k < n; ++k) data[k] = tmp[k];
}

/*
 * Inverse 1D orthonormal Haar on n elements (arbitrary even n), in-place.
 */
static void haar1d_inv_n(double* data, int n) {
    std::vector<double> tmp(n);
    int half = n / 2;
    for (int k = 0; k < half; ++k) {
        tmp[2*k]     = (data[k] + data[k + half]) * INV_SQRT2;
        tmp[2*k + 1] = (data[k] - data[k + half]) * INV_SQRT2;
    }
    for (int k = 0; k < n; ++k) data[k] = tmp[k];
}

int calcDwtLevels(int width, int height) {
    int levels = 0;
    int w = width, h = height;
    while (w >= 2 && h >= 2) {
        ++levels;
        w >>= 1;
        h >>= 1;
    }
    return std::min(levels, 6);
}

void dwtImage(double* data, int width, int height, int levels) {
    std::vector<double> buf;
    int w = width, h = height;

    for (int lev = 0; lev < levels; ++lev) {
        if (w < 2 || h < 2) break;

        // Round down to even so Haar pairs are well-defined at this level.
        // Any odd-boundary pixel in the last column/row is left untransformed.
        int wt = w & ~1;
        int ht = h & ~1;

        // Forward Haar on rows: transform wt elements of each of the first ht rows.
        buf.resize(wt);
        for (int y = 0; y < ht; ++y) {
            std::copy(data + (size_t)y * width,
                      data + (size_t)y * width + wt,
                      buf.data());
            haar1d_fwd_n(buf.data(), wt);
            std::copy(buf.data(), buf.data() + wt,
                      data + (size_t)y * width);
        }

        // Forward Haar on columns: transform ht elements of each of the first wt columns.
        buf.resize(ht);
        for (int x = 0; x < wt; ++x) {
            for (int y = 0; y < ht; ++y) buf[y] = data[(size_t)y * width + x];
            haar1d_fwd_n(buf.data(), ht);
            for (int y = 0; y < ht; ++y) data[(size_t)y * width + x] = buf[y];
        }

        w = wt / 2;
        h = ht / 2;
    }
}

void idwtImage(double* data, int width, int height, int levels) {
    if (levels <= 0) return;

    // Replay the forward pass to record the exact (wt, ht) at each level.
    std::vector<int> fwdW(levels), fwdH(levels);
    {
        int w = width, h = height;
        for (int lev = 0; lev < levels; ++lev) {
            fwdW[lev] = w & ~1;
            fwdH[lev] = h & ~1;
            w = fwdW[lev] / 2;
            h = fwdH[lev] / 2;
        }
    }

    std::vector<double> buf;

    // Reconstruct from coarsest level (levels-1) back to finest (0).
    for (int lev = levels - 1; lev >= 0; --lev) {
        int tw = fwdW[lev]; // width of subimage that was transformed at this level
        int th = fwdH[lev]; // height

        if (tw < 2 || th < 2) continue;

        // Inverse column transform: undo the column step of the forward pass.
        buf.resize(th);
        for (int x = 0; x < tw; ++x) {
            for (int y = 0; y < th; ++y) buf[y] = data[(size_t)y * width + x];
            haar1d_inv_n(buf.data(), th);
            for (int y = 0; y < th; ++y) data[(size_t)y * width + x] = buf[y];
        }

        // Inverse row transform: undo the row step of the forward pass.
        buf.resize(tw);
        for (int y = 0; y < th; ++y) {
            std::copy(data + (size_t)y * width,
                      data + (size_t)y * width + tw,
                      buf.data());
            haar1d_inv_n(buf.data(), tw);
            std::copy(buf.data(), buf.data() + tw,
                      data + (size_t)y * width);
        }
    }
}

double dwtQuantStep(int x, int y, int width, int height, int levels, double baseStep) {
    // Replay the forward pass dimensions (levels capped at 6, so fixed arrays suffice).
    // fwdW[lev] / fwdH[lev] = even dimension of the subimage transformed at forward level `lev`.
    int fwdW[6], fwdH[6];
    {
        int fw = width, fh = height;
        for (int lev = 0; lev < levels; ++lev) {
            fwdW[lev] = fw & ~1;
            fwdH[lev] = fh & ~1;
            fw = fwdW[lev] / 2;
            fh = fwdH[lev] / 2;
        }
    }

    // A coefficient at (x, y) belongs to the detail band of forward level `lev` if
    // it lies within [0, fwdW[lev]) × [0, fwdH[lev]) but NOT in the LL quadrant
    // [0, fwdW[lev]/2) × [0, fwdH[lev]/2).  Scan from coarsest to finest so the
    // smallest (innermost) enclosing block wins.
    for (int lev = levels - 1; lev >= 0; --lev) {
        int tw = fwdW[lev], th = fwdH[lev];
        bool inBlock = (x < tw && y < th);
        bool inLL    = (x < tw / 2 && y < th / 2);

        if (inBlock && !inLL) {
            // Detail band at forward level `lev`.
            // lev=0 (finest details) → baseStep (most quantization)
            // lev=levels-1 (coarsest details) → baseStep / 2^(levels-1) (least among details)
            return std::max(1.0, baseStep / (double)(1 << lev));
        }
    }

    // LL approximation: smallest step, preserving the global structure.
    return std::max(1.0, baseStep / (double)(1 << levels));
}
