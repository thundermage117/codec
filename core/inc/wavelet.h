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
#ifndef WAVELET_H
#define WAVELET_H

/*
 * Forward 2D Haar Discrete Wavelet Transform on an 8x8 block.
 * Applies a 3-level separable orthonormal Haar decomposition (rows then columns).
 * The top-left coefficient dst[0][0] captures the global average (DC).
 * The remaining coefficients are detail sub-bands at decreasing scales.
 */
void dwt8x8(const double src[8][8], double dst[8][8]);

/*
 * Inverse 2D Haar Discrete Wavelet Transform on an 8x8 block.
 * Reconstructs the original signal from the DWT coefficient layout produced
 * by dwt8x8. Exact inverse (perfect reconstruction).
 */
void idwt8x8(const double src[8][8], double dst[8][8]);

/*
 * Compute the number of DWT decomposition levels appropriate for an image
 * of the given dimensions. Stops when halving would produce a dimension < 2.
 * Capped at 6 levels for practical purposes.
 */
int calcDwtLevels(int width, int height);

/*
 * Full-image forward 2D Haar DWT applied in-place on a flat row-major buffer.
 * `data` has stride `width`. Applies `levels` levels of decomposition, each
 * time operating on the top-left LL subband from the previous level.
 *
 * Subband layout in `data` after transform (example: 3-level on W×H):
 *   [0, W/8) × [0, H/8)   — LL3 approximation
 *   rest of [0, W/4)×[0, H/4)   — level-3 detail bands (coarsest)
 *   rest of [0, W/2)×[0, H/2)   — level-2 detail bands
 *   rest of [0, W)×[0, H)       — level-1 detail bands (finest)
 */
void dwtImage(double* data, int width, int height, int levels);

/*
 * Full-image inverse 2D Haar DWT applied in-place. Exact inverse of dwtImage
 * with the same `levels`. Reconstructs the original signal perfectly (before
 * any quantization).
 */
void idwtImage(double* data, int width, int height, int levels);

/*
 * Returns the wavelet quantization step size for the coefficient at pixel
 * position (x, y) in a DWT coefficient image of size width×height with
 * `levels` decomposition levels.
 *
 * `baseStep` is the step for the finest detail level; coarser levels use
 * progressively smaller steps (halved per level), and the LL approximation
 * band uses the smallest step of all.
 */
double dwtQuantStep(int x, int y, int width, int height, int levels, double baseStep);

/*
 * Estimates the total bits needed for a DWT coefficient buffer.
 */
double dwtEstimateBits(const double* data, int width, int height);

#endif // WAVELET_H
