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
 * Wavelet filter used by the full-image transform.
 *   Haar  — 2-tap orthonormal filter. Cheap, but low-order: at low quality it
 *           leaves its own blocky, piecewise-constant artifacts.
 *   CDF97 — Cohen–Daubechies–Feauveau 9/7 biorthogonal filter (the JPEG 2000
 *           lossy wavelet), computed via lifting with symmetric extension.
 *           Smooth basis functions give much more graceful degradation.
 */
enum class WaveletType {
    Haar,
    CDF97
};

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
 * Full-image forward 2D DWT (Haar by default) applied in-place on a flat row-major buffer.
 * `data` has stride `width`. Applies `levels` levels of decomposition, each
 * time operating on the top-left LL subband from the previous level.
 *
 * Subband layout in `data` after transform (example: 3-level on W×H):
 *   [0, W/8) × [0, H/8)   — LL3 approximation
 *   rest of [0, W/4)×[0, H/4)   — level-3 detail bands (coarsest)
 *   rest of [0, W/2)×[0, H/2)   — level-2 detail bands
 *   rest of [0, W)×[0, H)       — level-1 detail bands (finest)
 */
void dwtImage(double* data, int width, int height, int levels,
              WaveletType type = WaveletType::Haar);

/*
 * Full-image inverse 2D DWT applied in-place. Exact inverse of dwtImage
 * with the same `levels` and `type`. Reconstructs the original signal perfectly (before
 * any quantization).
 */
void idwtImage(double* data, int width, int height, int levels,
               WaveletType type = WaveletType::Haar);

/*
 * Returns the wavelet quantization step size for the coefficient at pixel
 * position (x, y) in a DWT coefficient image of size width×height with
 * `levels` decomposition levels.
 *
 * `baseStep` is the step for the finest detail level. Both supported
 * wavelets are (near-)orthonormal, for which a uniform step is MSE-optimal,
 * so coarser levels only get a mild perceptual reduction (see
 * DWT_LEVEL_STEP_RATIO), and the LL approximation band uses the smallest
 * step of all.
 */
double dwtQuantStep(int x, int y, int width, int height, int levels, double baseStep);

/*
 * Returns the subband index of coefficient (x, y) in a `levels`-level DWT
 * coefficient image: 0 is the LL approximation, and level `lev` detail bands
 * are 1 + 3·lev + {0: HL, 1: LH, 2: HH}. There are 3·levels + 1 bands.
 */
int dwtSubbandIndex(int x, int y, int width, int height, int levels);

/*
 * Estimates the total bits needed to entropy-code a buffer of DWT
 * quantization indices, as the per-subband zeroth-order entropy
 * (see EntropyEstimator).
 */
double dwtEstimateBits(const double* data, int width, int height, int levels);

#endif // WAVELET_H
