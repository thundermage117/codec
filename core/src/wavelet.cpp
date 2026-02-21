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
#include <cmath>

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
