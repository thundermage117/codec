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
#include "CodecAnalysis.h"
#include <cmath>
#include "colorspace.h"
#include <algorithm>

Image CodecAnalysis::computeArtifactMap(
    const Image& original,
    const Image& reconstructed,
    double gain
) {
    if (original.width() != reconstructed.width() ||
        original.height() != reconstructed.height() ||
        original.channels() != reconstructed.channels()) {
        throw std::invalid_argument("Image size mismatch");
    }

    Image artifact(original.width(),
                   original.height(),
                   original.channels());

    const double* p1 = original.data();
    const double* p2 = reconstructed.data();
    double* out = artifact.data();

    const size_t total = original.size();

    for (size_t i = 0; i < total; ++i) {
        double diff = std::abs(p1[i] - p2[i]) * gain;

        // clamp to [0, 255]
        diff = std::min(255.0, diff);

        out[i] = diff;
    }

    return artifact;
}

double CodecAnalysis::computePSNR(const Image& I1, const Image& I2) {
    if (I1.width() != I2.width() || I1.height() != I2.height() || I1.channels() != I2.channels()) {
        return 0.0; // Or throw an exception
    }

    double mse = 0.0;
    const double* p1 = I1.data();
    const double* p2 = I2.data();
    const size_t totalSize = I1.size();

    for (size_t i = 0; i < totalSize; ++i) {
        double diff = p1[i] - p2[i];
        mse += diff * diff;
    }
    mse /= static_cast<double>(totalSize);

    if (mse <= 1e-10) return 100.0;

    return 10.0 * log10((255.0 * 255.0) / mse);
}

CodecMetrics CodecAnalysis::computeMetrics(const Image& originalBgr, const Image& reconstructedBgr) {
    CodecMetrics metrics;

    // 1. Convert both images to YCrCb to analyze channels separately
    Image originalYCrCb = bgrToYCrCb(originalBgr);
    Image reconstructedYCrCb = bgrToYCrCb(reconstructedBgr);

    // 2. Create single-channel images for original
    Image originalY(originalBgr.width(), originalBgr.height(), 1);
    Image originalCr(originalBgr.width(), originalBgr.height(), 1);
    Image originalCb(originalBgr.width(), originalBgr.height(), 1);

    // 3. Create single-channel images for reconstructed
    Image reconY(originalBgr.width(), originalBgr.height(), 1);
    Image reconCr(originalBgr.width(), originalBgr.height(), 1);
    Image reconCb(originalBgr.width(), originalBgr.height(), 1);

    const size_t numPixels = static_cast<size_t>(originalBgr.width()) * originalBgr.height();

    // 4. Split channels for both images
    const double* origYCrCbData = originalYCrCb.data();
    const double* reconYCrCbData = reconstructedYCrCb.data();
    double* origYData = originalY.data();
    double* origCrData = originalCr.data();
    double* origCbData = originalCb.data();
    double* rYData = reconY.data();
    double* rCrData = reconCr.data();
    double* rCbData = reconCb.data();

    for (size_t i = 0; i < numPixels; ++i) {
        origYData[i]  = *origYCrCbData++;
        origCrData[i] = *origYCrCbData++;
        origCbData[i] = *origYCrCbData++;

        rYData[i]  = *reconYCrCbData++;
        rCrData[i] = *reconYCrCbData++;
        rCbData[i] = *reconYCrCbData++;
    }

    // 5. Compute PSNR for each channel
    metrics.psnrY = computePSNR(originalY, reconY);
    metrics.psnrCr = computePSNR(originalCr, reconCr);
    metrics.psnrCb = computePSNR(originalCb, reconCb);

    // 6. Compute artifact map on the BGR images
    metrics.artifactMap = computeArtifactMap(originalBgr, reconstructedBgr);

    return metrics;
}
