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
#include "../inc/BitEstimator.h"
#include "../inc/ImageCodec.h"
#include "../inc/transform.h"

#include <algorithm>
#include <cmath>
#include <cstdlib>

namespace {

const int ZIGZAG[64] = {
     0,  1,  8, 16,  9,  2,  3, 10,
    17, 24, 32, 25, 18, 11,  4,  5,
    12, 19, 26, 33, 40, 48, 41, 34,
    27, 20, 13,  6,  7, 14, 21, 28,
    35, 42, 49, 56, 57, 50, 43, 36,
    29, 22, 15, 23, 30, 37, 44, 51,
    58, 59, 52, 45, 38, 31, 39, 46,
    53, 60, 61, 54, 47, 55, 62, 63,
};

int magnitudeBits(int v) {
    int size = 0;
    for (int a = std::abs(v); a > 0; a >>= 1) ++size;
    return size;
}

int median3(int a, int b, int c) {
    return std::max(std::min(a, b), std::min(std::max(a, b), c));
}

}  // namespace

namespace BitEstimator {

int blockBits(const int q[64]) {
    bool allZero = true;
    for (int i = 0; i < 64; ++i) {
        if (q[i] != 0) { allZero = false; break; }
    }
    if (allZero) return 1;

    int bits = q[0] == 0 ? 2 : 3 + magnitudeBits(q[0]);
    int run = 0;
    for (int i = 1; i < 64; ++i) {
        const int ac = q[ZIGZAG[i]];
        if (ac == 0) {
            ++run;
            continue;
        }
        while (run > 15) {
            bits += 11;  // ZRL
            run -= 16;
        }
        const int size = magnitudeBits(ac);
        bits += (run < 4 && size < 4 ? 5 : 9) + size;
        run = 0;
    }
    if (run > 0) bits += 4;  // EOB
    return bits;
}

double planeBits(const std::vector<int>& plane, int width, int height, double quality,
                 int* skippedBlocks) {
    if (skippedBlocks) *skippedBlocks = 0;
    if (width < 8 || height < 8 || plane.size() != static_cast<size_t>(width) * height)
        return 0.0;

    double table[8][8];
    ImageCodec::scaledQuantTable(std::clamp(quality, 1.0, 100.0), false, table);

    double total = 0.0;
    double block[8][8];
    double coeffs[8][8];
    int quantized[64];
    for (int by = 0; by + 8 <= height; by += 8) {
        for (int bx = 0; bx + 8 <= width; bx += 8) {
            for (int y = 0; y < 8; ++y)
                for (int x = 0; x < 8; ++x)
                    block[y][x] = plane[static_cast<size_t>(by + y) * width + bx + x];
            dct8x8(block, coeffs);
            for (int y = 0; y < 8; ++y)
                for (int x = 0; x < 8; ++x)
                    quantized[y * 8 + x] = static_cast<int>(std::lround(coeffs[y][x] / table[y][x]));
            const int bits = blockBits(quantized);
            if (bits == 1 && skippedBlocks) ++*skippedBlocks;
            total += bits;
        }
    }
    return total;
}

int signedExpGolombBits(int v) {
    // se(v) maps v to k = 2|v| (-1 if v > 0); ue(k) takes 2*floor(log2(k+1)) + 1 bits.
    const unsigned k = v > 0 ? 2u * static_cast<unsigned>(v) - 1u : 2u * static_cast<unsigned>(-v);
    int lead = 0;
    for (unsigned x = k + 1; x > 1; x >>= 1) ++lead;
    return 2 * lead + 1;
}

double motionVectorBits(const std::vector<MotionVector>& mvs, int cols, int rows) {
    if (cols <= 0 || rows <= 0 || mvs.size() != static_cast<size_t>(cols) * rows) return 0.0;

    auto at = [&](int c, int r) -> const MotionVector& {
        return mvs[static_cast<size_t>(r) * cols + c];
    };

    double bits = 0.0;
    for (int r = 0; r < rows; ++r) {
        for (int c = 0; c < cols; ++c) {
            int px = 0, py = 0;
            if (r == 0) {
                // Only the left neighbour exists on the first row.
                if (c > 0) { px = at(c - 1, r).dx; py = at(c - 1, r).dy; }
            } else {
                const MotionVector& b = at(c, r - 1);
                const MotionVector& a = c > 0 ? at(c - 1, r) : b;
                const MotionVector& d = c + 1 < cols ? at(c + 1, r - 1) : (c > 0 ? at(c - 1, r - 1) : b);
                px = median3(a.dx, b.dx, d.dx);
                py = median3(a.dy, b.dy, d.dy);
            }
            const MotionVector& mv = at(c, r);
            bits += signedExpGolombBits(mv.dx - px) + signedExpGolombBits(mv.dy - py);
        }
    }
    return bits;
}

}  // namespace BitEstimator
