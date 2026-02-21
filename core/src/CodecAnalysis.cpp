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

Image CodecAnalysis::computeEdgeDistortionMap(
    const Image& original,
    const Image& reconstructed
) {
    int w = original.width();
    int h = original.height();
    Image edgeDist(w, h, 1);
    
    // Simple Sobel-based edge detection and error comparison
    for (int y = 1; y < h - 1; ++y) {
        for (int x = 1; x < w - 1; ++x) {
            // Compute gradient in original
            double gx = original.at(x+1, y, 0) - original.at(x-1, y, 0);
            double gy = original.at(x, y+1, 0) - original.at(x, y-1, 0);
            double gradOrig = std::sqrt(gx*gx + gy*gy);
            
            // Compute gradient in reconstructed
            double rgx = reconstructed.at(x+1, y, 0) - reconstructed.at(x-1, y, 0);
            double rgy = reconstructed.at(x, y+1, 0) - reconstructed.at(x, y-1, 0);
            double gradRecon = std::sqrt(rgx*rgx + rgy*rgy);
            
            // Error is the loss of edge strength or introduction of spurious edges
            double diff = std::abs(gradOrig - gradRecon) * 4.0;
            edgeDist.at(x, y, 0) = std::min(255.0, diff);
        }
    }
    return edgeDist;
}

Image CodecAnalysis::computeBlockingMap(
    const Image& reconstructed
) {
    int w = reconstructed.width();
    int h = reconstructed.height();
    Image blocking(w, h, 1);
    
    // Detect discontinuities at 8x8 boundaries
    for (int y = 0; y < h; ++y) {
        for (int x = 0; x < w; ++x) {
            double score = 0.0;
            if (x % 8 == 0 && x > 0 && x < w) {
                double diff = std::abs(reconstructed.at(x, y, 0) - reconstructed.at(x-1, y, 0));
                score += diff;
            }
            if (y % 8 == 0 && y > 0 && y < h) {
                double diff = std::abs(reconstructed.at(x, y, 0) - reconstructed.at(x, y-1, 0));
                score += diff;
            }
            blocking.at(x, y, 0) = std::min(255.0, score * 8.0);
        }
    }
    return blocking;
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

// Helper for SSIM
static double getMean(const double* data, int width, int height, int x, int y, int kernelSize) {
    double sum = 0.0;
    int count = 0;
    int half = kernelSize / 2;

    for (int j = -half; j <= half; ++j) {
        for (int i = -half; i <= half; ++i) {
            int cx = x + i;
            int cy = y + j;
            if (cx >= 0 && cx < width && cy >= 0 && cy < height) {
                sum += data[cy * width + cx];
                count++;
            }
        }
    }
    return (count > 0) ? (sum / count) : 0.0;
}

static double getVariance(const double* data, int width, int height, int x, int y, int kernelSize, double mean) {
    double sum = 0.0;
    int count = 0;
    int half = kernelSize / 2;

    for (int j = -half; j <= half; ++j) {
        for (int i = -half; i <= half; ++i) {
            int cx = x + i;
            int cy = y + j;
            if (cx >= 0 && cx < width && cy >= 0 && cy < height) {
                double diff = data[cy * width + cx] - mean;
                sum += diff * diff;
                count++;
            }
        }
    }
    return (count > 0) ? (sum / count) : 0.0;
}

static double getCovariance(const double* d1, const double* d2, int width, int height, int x, int y, int kernelSize, double mean1, double mean2) {
    double sum = 0.0;
    int count = 0;
    int half = kernelSize / 2;

    for (int j = -half; j <= half; ++j) {
        for (int i = -half; i <= half; ++i) {
            int cx = x + i;
            int cy = y + j;
            if (cx >= 0 && cx < width && cy >= 0 && cy < height) {
                double diff1 = d1[cy * width + cx] - mean1;
                double diff2 = d2[cy * width + cx] - mean2;
                sum += diff1 * diff2;
                count++;
            }
        }
    }
    return (count > 0) ? (sum / count) : 0.0;
}

double CodecAnalysis::computeSSIM(const Image& I1, const Image& I2) {
    if (I1.width() != I2.width() || I1.height() != I2.height() || I1.channels() != I2.channels()) {
        return 0.0;
    }

    const double C1 = 6.5025;  // (0.01 * 255)^2
    const double C2 = 58.5225; // (0.03 * 255)^2
    
    int width = I1.width();
    int height = I1.height();
    const double* d1 = I1.data();
    const double* d2 = I2.data();
    
    // Using a simpler block-based approach for performance instead of full sliding window Gaussian
    // But to be somewhat accurate we'll use a sliding window with stride
    // For this implementation, let's do a basic sliding window with a small stride for speed
    // or just checking every Nth pixel.
    
    // Let's do a proper sliding window but maybe with skip if needed. 
    // For now, full sliding window.
    
    // NOTE: This is a simplified SSIM. A full Gaussian weighting is standard but slower.
    // Using an 8x8 uniform window is a common approximation.
    int kernelSize = 8;
    int stride = 4; // Speed up calculation
    
    double mssim = 0.0;
    int blocks = 0;
    
    for (int y = 0; y < height; y += stride) {
        for (int x = 0; x < width; x += stride) {
            double ux = getMean(d1, width, height, x, y, kernelSize);
            double uy = getMean(d2, width, height, x, y, kernelSize);
            
            double sigx2 = getVariance(d1, width, height, x, y, kernelSize, ux);
            double sigy2 = getVariance(d2, width, height, x, y, kernelSize, uy);
            double sigxy = getCovariance(d1, d2, width, height, x, y, kernelSize, ux, uy);
            
            double num = (2 * ux * uy + C1) * (2 * sigxy + C2);
            double den = (ux * ux + uy * uy + C1) * (sigx2 + sigy2 + C2);
            
            mssim += (num / den);
            blocks++;
        }
    }
    
    return (blocks > 0) ? (mssim / blocks) : 0.0;
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

    // 6. Compute SSIM for each channel
    metrics.ssimY = computeSSIM(originalY, reconY);
    metrics.ssimCr = computeSSIM(originalCr, reconCr);
    metrics.ssimCb = computeSSIM(originalCb, reconCb);

    // 7. Compute artifact map on the BGR images
    metrics.artifactMap = computeArtifactMap(originalBgr, reconstructedBgr);

    return metrics;
}
