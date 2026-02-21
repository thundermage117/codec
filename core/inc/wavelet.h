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

#endif // WAVELET_H
