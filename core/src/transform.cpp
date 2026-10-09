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
#include "transform.h"
#include <cmath>

const double PI = 3.14159265358979323846;

/*
* Orthonormal 8-point DCT-II basis: B[u][x] = 1/2 · C(u) · cos((2x+1)uπ/16),
* with C(0) = 1/√2 and C(u) = 1 otherwise. Computed once on first use.
*
* The 2D DCT is separable, F = B · f · Bᵀ, and the IDCT is f = Bᵀ · F · B.
* Applying it as two 1D passes costs 2·8³ = 1024 multiply-adds per block,
* instead of 8⁴ = 4096 terms with two cos() calls each for the direct formula
* F(u,v) = 1/4 C(u) C(v) Σx Σy f(x,y) cos((2x+1)uπ/16) cos((2y+1)vπ/16).
*/
struct DctBasis {
    double m[8][8];
    DctBasis() {
        for (int u = 0; u < 8; ++u) {
            const double c = (u == 0) ? (1.0 / std::sqrt(2.0)) : 1.0;
            for (int x = 0; x < 8; ++x)
                m[u][x] = 0.5 * c * std::cos(((2 * x + 1) * u * PI) / 16.0);
        }
    }
};

static const double (&dctBasis())[8][8] {
    static const DctBasis basis; // thread-safe one-time initialisation
    return basis.m;
}

/*
* Performs the 2D Discrete Cosine Transform (DCT-II) on an 8x8 block.
* src is indexed [x][y] (row, column); dst is indexed [u][v].
*/
void dct8x8(const double src[8][8], double dst[8][8]) {
    const double (&B)[8][8] = dctBasis();
    double tmp[8][8]; // tmp = B · src (transform along the first index)

    for (int u = 0; u < 8; ++u)
        for (int y = 0; y < 8; ++y) {
            double sum = 0.0;
            for (int x = 0; x < 8; ++x) sum += B[u][x] * src[x][y];
            tmp[u][y] = sum;
        }

    for (int u = 0; u < 8; ++u)
        for (int v = 0; v < 8; ++v) {
            double sum = 0.0;
            for (int y = 0; y < 8; ++y) sum += tmp[u][y] * B[v][y];
            dst[u][v] = sum;
        }
}

/*
* Performs the Inverse Discrete Cosine Transform (IDCT) on an 8x8 block.
* src is indexed [u][v]; dst is indexed [x][y].
*/
void idct8x8(const double src[8][8], double dst[8][8]) {
    const double (&B)[8][8] = dctBasis();
    double tmp[8][8]; // tmp = Bᵀ · src

    for (int x = 0; x < 8; ++x)
        for (int v = 0; v < 8; ++v) {
            double sum = 0.0;
            for (int u = 0; u < 8; ++u) sum += B[u][x] * src[u][v];
            tmp[x][v] = sum;
        }

    for (int x = 0; x < 8; ++x)
        for (int y = 0; y < 8; ++y) {
            double sum = 0.0;
            for (int v = 0; v < 8; ++v) sum += tmp[x][v] * B[v][y];
            dst[x][y] = sum;
        }
}
