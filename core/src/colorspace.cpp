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
#include "colorspace.h"
#include <algorithm> // For std::min/max

Image bgrToYCrCb(const Image& input)
{
    Image output(input.width(), input.height(), 3);
    const double* pIn = input.data();
    double* pOut = output.data();
    const size_t numPixels = static_cast<size_t>(input.width()) * input.height();

    for (size_t i = 0; i < numPixels; ++i) {
        // BGR order
        const double B = *pIn++;
        const double G = *pIn++;
        const double R = *pIn++;

        double Y  =  0.299 * R + 0.587 * G + 0.114 * B;
        double Cr = (R - Y) * 0.713 + 128;
        double Cb = (B - Y) * 0.564 + 128;

        *pOut++ = Y;
        *pOut++ = Cr;
        *pOut++ = Cb;
    }
    return output;
}

Image ycrcbToBgr(const Image& input)
{
    Image output(input.width(), input.height(), 3);
    auto clamp = [](double val) { return std::max(0.0, std::min(255.0, val)); };
    const double* pIn = input.data();
    double* pOut = output.data();
    const size_t numPixels = static_cast<size_t>(input.width()) * input.height();

    for (size_t i = 0; i < numPixels; ++i) {
        const double Y  = *pIn++;
        const double Cr = *pIn++;
        const double Cb = *pIn++;

        double R = Y + 1.402 * (Cr - 128);
        double G = Y - 0.344136 * (Cb - 128) - 0.714136 * (Cr - 128);
        double B = Y + 1.772 * (Cb - 128);

        *pOut++ = clamp(B);
        *pOut++ = clamp(G);
        *pOut++ = clamp(R);
    }
    return output;
}