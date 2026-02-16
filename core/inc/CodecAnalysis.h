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

#include "Image.h"

struct CodecMetrics {
    double psnrY = 0.0;
    double psnrCr = 0.0;
    double psnrCb = 0.0;
    double ssimY = 0.0;
    double ssimCr = 0.0;
    double ssimCb = 0.0;
    Image artifactMap;
};

class CodecAnalysis {
public:
    // Compute absolute difference heatmap
    static Image computeArtifactMap(
        const Image& original,
        const Image& reconstructed,
        double gain = 5.0
    );

    // Compute PSNR (moved out of utils if you want)
    static double computePSNR(
        const Image& I1,
        const Image& I2
    );

    // Compute SSIM
    static double computeSSIM(
        const Image& I1,
        const Image& I2
    );

    // Compute all metrics
    static CodecMetrics computeMetrics(
        const Image& originalBgr,
        const Image& reconstructedBgr
    );
};
