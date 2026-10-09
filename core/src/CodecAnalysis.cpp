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
#include <vector>

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

// Luma of pixel (x, y): BT.601 weights for a 3-channel BGR image, or the single
// channel itself for 1-channel input. The structural maps below work on luma so
// that a distortion in any colour channel is seen (channel 0 alone is blue).
static double lumaAt(const Image& img, int x, int y) {
    if (img.channels() == 1) return img.at(x, y, 0);
    return 0.114 * img.at(x, y, 0) + 0.587 * img.at(x, y, 1) + 0.299 * img.at(x, y, 2);
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
            double gx = lumaAt(original, x+1, y) - lumaAt(original, x-1, y);
            double gy = lumaAt(original, x, y+1) - lumaAt(original, x, y-1);
            double gradOrig = std::sqrt(gx*gx + gy*gy);
            
            // Compute gradient in reconstructed
            double rgx = lumaAt(reconstructed, x+1, y) - lumaAt(reconstructed, x-1, y);
            double rgy = lumaAt(reconstructed, x, y+1) - lumaAt(reconstructed, x, y-1);
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
                double diff = std::abs(lumaAt(reconstructed, x, y) - lumaAt(reconstructed, x-1, y));
                score += diff;
            }
            if (y % 8 == 0 && y > 0 && y < h) {
                double diff = std::abs(lumaAt(reconstructed, x, y) - lumaAt(reconstructed, x, y-1));
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

// --- SSIM (Wang, Bovik, Sheikh & Simoncelli, 2004) ---------------------------
// 11×11 Gaussian window with σ = 1.5, constants K1 = 0.01, K2 = 0.03 for 8-bit
// data, evaluated at every pixel and averaged over the region where the window
// fits inside the image (as in the reference ssim_index.m and scikit-image
// with gaussian_weights=True). Images smaller than the window are handled by
// clamping at the borders and averaging over every pixel.

static const int SSIM_RADIUS = 5;
static const double SSIM_SIGMA = 1.5;

static std::vector<double> ssimKernel() {
    std::vector<double> k(2 * SSIM_RADIUS + 1);
    double sum = 0.0;
    for (int i = -SSIM_RADIUS; i <= SSIM_RADIUS; ++i) {
        k[i + SSIM_RADIUS] = std::exp(-(i * i) / (2.0 * SSIM_SIGMA * SSIM_SIGMA));
        sum += k[i + SSIM_RADIUS];
    }
    for (double& v : k) v /= sum;
    return k;
}

// One 1D pass of the symmetric (2r+1)-tap Gaussian over n samples spaced
// `stride` apart, with edge clamping. The kernel is symmetric, so taps are
// paired (half the multiplies), and clamping is only done near the ends.
static void gaussian1D(const double* src, double* dst, int n, size_t stride, const std::vector<double>& k) {
    const int r = SSIM_RADIUS;
    auto at = [&](int i) { return src[(size_t)std::max(0, std::min(n - 1, i)) * stride]; };
    for (int x = 0; x < n; ++x) {
        double acc = k[r] * src[(size_t)x * stride];
        if (x >= r && x < n - r) {
            for (int i = 1; i <= r; ++i)
                acc += k[r + i] * (src[(size_t)(x - i) * stride] + src[(size_t)(x + i) * stride]);
        } else {
            for (int i = 1; i <= r; ++i)
                acc += k[r + i] * (at(x - i) + at(x + i));
        }
        dst[(size_t)x * stride] = acc;
    }
}

// Separable Gaussian blur of a w×h plane with edge clamping.
static std::vector<double> gaussianBlur(const std::vector<double>& src, int w, int h,
                                        const std::vector<double>& k) {
    std::vector<double> tmp(src.size()), out(src.size());
    for (int y = 0; y < h; ++y)
        gaussian1D(src.data() + (size_t)y * w, tmp.data() + (size_t)y * w, w, 1, k);
    for (int x = 0; x < w; ++x)
        gaussian1D(tmp.data() + x, out.data() + x, h, (size_t)w, k);
    return out;
}

static double ssimPlane(const std::vector<double>& a, const std::vector<double>& b, int w, int h) {
    const double C1 = (0.01 * 255.0) * (0.01 * 255.0);
    const double C2 = (0.03 * 255.0) * (0.03 * 255.0);
    const std::vector<double> k = ssimKernel();

    std::vector<double> aa(a.size()), bb(a.size()), ab(a.size());
    for (size_t i = 0; i < a.size(); ++i) {
        aa[i] = a[i] * a[i];
        bb[i] = b[i] * b[i];
        ab[i] = a[i] * b[i];
    }
    const auto muA = gaussianBlur(a, w, h, k);
    const auto muB = gaussianBlur(b, w, h, k);
    const auto eAA = gaussianBlur(aa, w, h, k);
    const auto eBB = gaussianBlur(bb, w, h, k);
    const auto eAB = gaussianBlur(ab, w, h, k);

    const bool fits = w > 2 * SSIM_RADIUS && h > 2 * SSIM_RADIUS;
    const int r = fits ? SSIM_RADIUS : 0;
    double sum = 0.0;
    long long count = 0;
    for (int y = r; y < h - r; ++y)
        for (int x = r; x < w - r; ++x) {
            const size_t i = (size_t)y * w + x;
            const double varA = eAA[i] - muA[i] * muA[i];
            const double varB = eBB[i] - muB[i] * muB[i];
            const double cov  = eAB[i] - muA[i] * muB[i];
            sum += ((2.0 * muA[i] * muB[i] + C1) * (2.0 * cov + C2)) /
                   ((muA[i] * muA[i] + muB[i] * muB[i] + C1) * (varA + varB + C2));
            ++count;
        }
    return count > 0 ? sum / static_cast<double>(count) : 1.0;
}

double CodecAnalysis::computeSSIM(const Image& I1, const Image& I2) {
    if (I1.width() != I2.width() || I1.height() != I2.height() || I1.channels() != I2.channels()) {
        return 0.0;
    }

    // Multi-channel input: mean SSIM over channels.
    const int w = I1.width(), h = I1.height(), ch = I1.channels();
    const size_t n = static_cast<size_t>(w) * h;
    double total = 0.0;
    std::vector<double> a(n), b(n);
    for (int c = 0; c < ch; ++c) {
        for (size_t i = 0; i < n; ++i) {
            a[i] = I1.data()[i * ch + c];
            b[i] = I2.data()[i * ch + c];
        }
        total += ssimPlane(a, b, w, h);
    }
    return total / ch;
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
