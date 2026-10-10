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
#include "entropy.h"
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
    if (n > 8) return; // Basic safety check
    double tmp[8] = {0};
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
    if (n > 8) return; // Basic safety check
    double tmp[8] = {0};
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

// CDF 9/7 lifting coefficients (Daubechies & Sweldens factorisation).
static const double CDF97_ALPHA = -1.586134342059924;
static const double CDF97_BETA  = -0.052980118572961;
static const double CDF97_GAMMA =  0.882911075530934;
static const double CDF97_DELTA =  0.443506852043971;
static const double CDF97_K     =  1.230174104914001;
// Scale low/high bands so the filter has the same √2 DC gain as the
// orthonormal Haar — keeps quantization steps comparable across wavelets.
static const double CDF97_LOW_SCALE  = SQRT2 / CDF97_K;
static const double CDF97_HIGH_SCALE = CDF97_K / SQRT2;

// One lifting step over the odd (parity=1) or even (parity=0) samples:
// x[i] += c * (x[i-1] + x[i+1]), with whole-sample symmetric extension
// (x[-1] = x[1], x[n] = x[n-2]). Requires even n >= 2.
static void cdf97_lift(double* x, int n, int parity, double c) {
    for (int i = parity; i < n; i += 2) {
        double left  = x[i > 0 ? i - 1 : 1];
        double right = x[i < n - 1 ? i + 1 : n - 2];
        x[i] += c * (left + right);
    }
}

/*
 * Forward 1D CDF 9/7 on n elements (even n), in-place.
 * Output layout matches haar1d_fwd_n: [low | high].
 */
static void cdf97_fwd_n(double* data, int n) {
    cdf97_lift(data, n, 1, CDF97_ALPHA);
    cdf97_lift(data, n, 0, CDF97_BETA);
    cdf97_lift(data, n, 1, CDF97_GAMMA);
    cdf97_lift(data, n, 0, CDF97_DELTA);

    std::vector<double> tmp(n);
    const int half = n / 2;
    for (int k = 0; k < half; ++k) {
        tmp[k]        = data[2*k]     * CDF97_LOW_SCALE;
        tmp[k + half] = data[2*k + 1] * CDF97_HIGH_SCALE;
    }
    std::copy(tmp.begin(), tmp.end(), data);
}

/*
 * Inverse 1D CDF 9/7 on n elements (even n), in-place.
 */
static void cdf97_inv_n(double* data, int n) {
    std::vector<double> tmp(n);
    const int half = n / 2;
    for (int k = 0; k < half; ++k) {
        tmp[2*k]     = data[k]        / CDF97_LOW_SCALE;
        tmp[2*k + 1] = data[k + half] / CDF97_HIGH_SCALE;
    }
    std::copy(tmp.begin(), tmp.end(), data);

    cdf97_lift(data, n, 0, -CDF97_DELTA);
    cdf97_lift(data, n, 1, -CDF97_GAMMA);
    cdf97_lift(data, n, 0, -CDF97_BETA);
    cdf97_lift(data, n, 1, -CDF97_ALPHA);
}

using Wavelet1D = void (*)(double*, int);

static Wavelet1D forward1D(WaveletType type) {
    return type == WaveletType::CDF97 ? cdf97_fwd_n : haar1d_fwd_n;
}

static Wavelet1D inverse1D(WaveletType type) {
    return type == WaveletType::CDF97 ? cdf97_inv_n : haar1d_inv_n;
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

void dwtImage(double* data, int width, int height, int levels, WaveletType type) {
    const Wavelet1D fwd = forward1D(type);
    std::vector<double> buf;
    int w = width, h = height;

    for (int lev = 0; lev < levels; ++lev) {
        if (w < 2 || h < 2) break;

        // Round down to even so filter pairs are well-defined at this level.
        // Any odd-boundary pixel in the last column/row is left untransformed.
        int wt = w & ~1;
        int ht = h & ~1;

        // Forward 1D transform on rows: transform wt elements of each of the first ht rows.
        buf.resize(wt);
        for (int y = 0; y < ht; ++y) {
            std::copy(data + (size_t)y * width,
                      data + (size_t)y * width + wt,
                      buf.data());
            fwd(buf.data(), wt);
            std::copy(buf.data(), buf.data() + wt,
                      data + (size_t)y * width);
        }

        // Forward 1D transform on columns: transform ht elements of each of the first wt columns.
        buf.resize(ht);
        for (int x = 0; x < wt; ++x) {
            for (int y = 0; y < ht; ++y) buf[y] = data[(size_t)y * width + x];
            fwd(buf.data(), ht);
            for (int y = 0; y < ht; ++y) data[(size_t)y * width + x] = buf[y];
        }

        w = wt / 2;
        h = ht / 2;
    }
}

void idwtImage(double* data, int width, int height, int levels, WaveletType type) {
    if (levels <= 0) return;
    const Wavelet1D inv = inverse1D(type);

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
            inv(buf.data(), th);
            for (int y = 0; y < th; ++y) data[(size_t)y * width + x] = buf[y];
        }

        // Inverse row transform: undo the row step of the forward pass.
        buf.resize(tw);
        for (int y = 0; y < th; ++y) {
            std::copy(data + (size_t)y * width,
                      data + (size_t)y * width + tw,
                      buf.data());
            inv(buf.data(), tw);
            std::copy(buf.data(), buf.data() + tw,
                      data + (size_t)y * width);
        }
    }
}

// Per-level step multiplier for coarser subbands. The previous scheme halved
// the step every level, which on an (near-)orthonormal transform spends far
// more bits on coarse bands than they are worth (uniform steps are MSE-optimal).
// 0.75 gave the best PSNR-at-equal-bitrate on the bundled test images.
static const double DWT_LEVEL_STEP_RATIO = 0.75;

int dwtSubbandIndex(int x, int y, int width, int height, int levels) {
    if (levels <= 0) return 0;

    // Safety cap to prevent buffer overflow and integer shift overflow.
    // 16 levels is enough for any image up to 65536x65536.
    if (levels > 16) levels = 16;

    int fwdW[16], fwdH[16];
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
        const int tw = fwdW[lev], th = fwdH[lev];
        const bool inBlock = (x < tw && y < th);
        const bool right   = (x >= tw / 2);
        const bool bottom  = (y >= th / 2);
        if (inBlock && (right || bottom)) {
            const int orientation = (right && bottom) ? 2 : (right ? 0 : 1);
            return 1 + 3 * lev + orientation;
        }
    }
    return 0; // LL approximation
}

double dwtQuantStep(int x, int y, int width, int height, int levels, double baseStep) {
    if (levels <= 0) return baseStep;
    const int band = dwtSubbandIndex(x, y, width, height, levels);
    // LL sits one level below the coarsest detail bands.
    const int lev = (band == 0) ? std::min(levels, 16) : (band - 1) / 3;
    // lev=0 (finest details) → baseStep (most quantization)
    // coarser levels → baseStep · ratio^lev (mild perceptual weighting)
    return std::max(1.0, baseStep * std::pow(DWT_LEVEL_STEP_RATIO, lev));
}

double dwtEstimateBits(const double* data, int width, int height, int levels) {
    EntropyEstimator estimator(3 * std::max(0, levels) + 1);
    for (int y = 0; y < height; ++y)
        for (int x = 0; x < width; ++x)
            estimator.add(dwtSubbandIndex(x, y, width, height, levels), data[(size_t)y * width + x]);
    return estimator.totalBits();
}
