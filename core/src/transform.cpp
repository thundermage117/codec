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
* Helper function to compute the normalization factor C(u) used in DCT and IDCT.
*/
static double C(int u) {
    return (u == 0) ? (1.0 / std::sqrt(2.0)) : 1.0;
}

/*
* Performs the Discrete Cosine Transform (DCT) on an 8x8 block.
* The input block should be of type CV_64F and the output will also be CV_64F.
* 2D DCT is computed using the formula:
* F(u, v) = 1/4 * C(u) * C(v) * sum_{x=0}^{7} sum_{y=0}^{7} f(x, y) * cos((2x+1)uπ/16) * cos((2y+1)vπ/16)
*/
void dct8x8(const double src[8][8], double dst[8][8]) {
    for (int u = 0; u < 8; ++u) {
        for (int v = 0; v < 8; ++v) {
            double sum = 0.0;
            for (int x = 0; x < 8; ++x) {
                for (int y = 0; y < 8; ++y) {
                    sum += src[x][y] *
                           std::cos(((2 * x + 1) * u * PI) / 16.0) *
                           std::cos(((2 * y + 1) * v * PI) / 16.0);
                }
            }
            dst[u][v] = 0.25 * C(u) * C(v) * sum;
        }
    }
}

/*
* Performs the Inverse Discrete Cosine Transform (IDCT) on an 8x8 block.
* The input block should be of type CV_64F and the output will also be CV_64F.
*/
void idct8x8(const double src[8][8], double dst[8][8]) {
    for (int x = 0; x < 8; ++x) {
        for (int y = 0; y < 8; ++y) {
            double sum = 0.0;
            for (int u = 0; u < 8; ++u) {
                for (int v = 0; v < 8; ++v) {
                    sum += C(u) * C(v) * src[u][v] *
                           std::cos(((2 * x + 1) * u * PI) / 16.0) *
                           std::cos(((2 * y + 1) * v * PI) / 16.0);
                }
            }
            dst[x][y] = 0.25 * sum;
        }
    }
}
