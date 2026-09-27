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
#pragma once
#include "MotionEstimator.h"
#include <vector>

/*
 * Rough bit-cost model for comparing intra (I) and inter (P) coding of the
 * same luma frame. Both sides use identical rules so the comparison is fair:
 *
 * - 8x8 DCT, JPEG luma table scaled by quality, zig-zag scan.
 * - JPEG-like symbol costs, matching web/src/lib/dct-utils.ts
 *   (DC: 2 bits if zero, else 3 + size; AC: 5 or 9 bits + size; ZRL 11;
 *   EOB 4).
 * - A block whose coefficients all quantize to zero costs 1 bit (a
 *   skip / coded-block flag), as in real video codecs.
 * - Only full 8x8 blocks are counted.
 */
namespace BitEstimator {

// Bits for one block of quantized coefficients in row-major order.
int blockBits(const int quantized[64]);

// Bits to code a signed plane (row-major, width x height), e.g. luma - 128
// for an I frame or the motion-compensated residual for a P frame.
// skippedBlocks (optional) receives the number of all-zero blocks.
double planeBits(const std::vector<int>& plane, int width, int height, double quality,
                 int* skippedBlocks = nullptr);

// Length of the signed Exp-Golomb code se(v) used for motion vectors.
int signedExpGolombBits(int v);

// Bits for a field of vectors in raster order, each coded as the difference
// from the component-wise median of its left, top and top-right neighbours.
double motionVectorBits(const std::vector<MotionVector>& mvs, int cols, int rows);

}  // namespace BitEstimator
