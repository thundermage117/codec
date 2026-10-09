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
#include "ImageCodec.h"
#include "transform.h"
#include "wavelet.h"
#include "colorspace.h"
#include "CodecAnalysis.h"
#include "entropy.h"

#include <cmath>
#include <vector>

// Standard JPEG base quantization tables
const int BASE_LUMA[8][8] = {
    {16, 11, 10, 16, 24, 40, 51, 61},
    {12, 12, 14, 19, 26, 58, 60, 55},
    {14, 13, 16, 24, 40, 57, 69, 56},
    {14, 17, 22, 29, 51, 87, 80, 62},
    {18, 22, 37, 56, 68, 109, 103, 77},
    {24, 35, 55, 64, 81, 104, 113, 92},
    {49, 64, 78, 87, 103, 121, 120, 101},
    {72, 92, 95, 98, 112, 100, 103, 99}
};

const int BASE_CHROMA[8][8] = {
    {17, 18, 24, 47, 99, 99, 99, 99},
    {18, 21, 26, 66, 99, 99, 99, 99},
    {24, 26, 56, 99, 99, 99, 99, 99},
    {47, 66, 99, 99, 99, 99, 99, 99},
    {99, 99, 99, 99, 99, 99, 99, 99},
    {99, 99, 99, 99, 99, 99, 99, 99},
    {99, 99, 99, 99, 99, 99, 99, 99},
    {99, 99, 99, 99, 99, 99, 99, 99}
};

// Quantization step for the finest wavelet detail band at quality 50. Chosen so
// that at equal quality the wavelet paths land near DCT's PSNR.
static const double DWT_BASE_STEP = 32.0;

// Chroma wavelet bands are quantized more coarsely than luma, mirroring the
// ratio between the JPEG chroma and luma tables used by the DCT path.
static const double DWT_CHROMA_STEP_SCALE = 1.5;

/*
* Maps a quality factor in [1, 100] to the standard IJG quantization scale
* (1.0 at quality 50, smaller for higher quality).
*/
static double qualityScale(double quality) {
    const double scale = (quality < 50.0) ? 5000.0 / quality
                                          : 200.0 - 2.0 * quality;
    return scale / 100.0;
}

static double clampPixel(double v) {
    return std::max(0.0, std::min(255.0, v));
}

ImageCodec::ImageCodec(double quality, bool enableQuantization, ChromaSubsampling cs, TransformType transform)
    : m_quality(std::max(1.0, std::min(100.0, quality))),
      m_enableQuantization(enableQuantization),
      m_chromaSubsampling(cs),
      m_transformType(transform)
{
    if (m_enableQuantization)
        generateQuantizationTables();
}

/*
* Generates quantization tables based on the specified quality factor.
* The quality factor should be in the range [1, 100], where higher values mean better quality (less compression).
* The quantization tables are derived from the standard JPEG tables and scaled according to the quality factor.
*/
void ImageCodec::generateQuantizationTables()
{
    const double scale = qualityScale(m_quality);

    for (int i = 0; i < 8; ++i) {
        for (int j = 0; j < 8; ++j) {

            double lq = std::round(BASE_LUMA[i][j] * scale);
            double cq = std::round(BASE_CHROMA[i][j] * scale);

            m_lumaQuantTable[i][j]   = std::max(1.0, lq);
            m_chromaQuantTable[i][j] = std::max(1.0, cq);
        }
    }
}

/*
 * Processes a single channel using the block-DCT pipeline (JPEG-style).
 * Each 8×8 block is forward-transformed, quantized with the supplied table,
 * dequantized, and inverse-transformed independently. Partial blocks at the
 * right/bottom edges are padded by edge replication (as JPEG encoders do),
 * coded like any other block, and cropped on write-back.
 */
Image ImageCodec::processChannel(const Image& channel,
                                 const double quantTable[8][8])
{
    const int width = channel.width();
    const int height = channel.height();
    Image reconstructed(width, height, 1);

    const double* channelData = channel.data();
    double* reconData = reconstructed.data();
    EntropyEstimator entropy(64); // one band per DCT frequency position

    for (int y = 0; y < height; y += 8) {
        for (int x = 0; x < width; x += 8) {
            double block[8][8];
            double dctBlock[8][8];
            double reconBlock[8][8];

            for (int i = 0; i < 8; ++i) {
                const int srcY = std::min(y + i, height - 1);
                for (int j = 0; j < 8; ++j) {
                    const int srcX = std::min(x + j, width - 1);
                    block[i][j] = channelData[srcY * width + srcX] - 128.0;
                }
            }

            dct8x8(block, dctBlock);

            if (m_enableQuantization) {
                for (int i = 0; i < 8; ++i)
                    for (int j = 0; j < 8; ++j) {
                        const double index = std::round(dctBlock[i][j] / quantTable[i][j]);
                        entropy.add(i * 8 + j, index);
                        dctBlock[i][j] = index * quantTable[i][j];
                    }
            }

            idct8x8(dctBlock, reconBlock);

            const int blockHeight = std::min(8, height - y);
            const int blockWidth = std::min(8, width - x);
            for (int i = 0; i < blockHeight; ++i)
                for (int j = 0; j < blockWidth; ++j)
                    reconData[(y + i) * width + (x + j)] = clampPixel(reconBlock[i][j] + 128.0);
        }
    }

    if (m_enableQuantization)
        m_lastBitEstimate += entropy.totalBits();
    return reconstructed;
}

/*
 * Pads a channel to a multiple of 2^levels by edge replication, applies the
 * DC level shift, and runs the full-image forward DWT with the configured
 * wavelet. `coeffs` receives the paddedW×paddedH coefficient buffer.
 */
void ImageCodec::transformChannelDWT(const Image& channel, std::vector<double>& coeffs,
                                      int& paddedW, int& paddedH, int& levels) const
{
    const int W_orig = channel.width();
    const int H_orig = channel.height();
    levels = calcDwtLevels(W_orig, H_orig);

    // Padding ensures every level can be halved evenly without leaving "original" edges.
    const int stride = (1 << levels);
    paddedW = (W_orig + stride - 1) & ~(stride - 1);
    paddedH = (H_orig + stride - 1) & ~(stride - 1);

    coeffs.assign(static_cast<size_t>(paddedW) * paddedH, 0.0);
    const double* src = channel.data();
    for (int y = 0; y < paddedH; ++y) {
        const int srcY = std::min(y, H_orig - 1);
        for (int x = 0; x < paddedW; ++x) {
            const int srcX = std::min(x, W_orig - 1);
            coeffs[(size_t)y * paddedW + x] = src[(size_t)srcY * W_orig + srcX] - 128.0;
        }
    }

    const WaveletType wavelet = (m_transformType == TransformType::DWT_97)
                                ? WaveletType::CDF97 : WaveletType::Haar;
    dwtImage(coeffs.data(), paddedW, paddedH, levels, wavelet);
}

/*
 * Processes a single channel using the full-image DWT pipeline.
 * Unlike the block DCT, the wavelet transform operates on the entire channel
 * at once, eliminating 8×8 blocking artifacts. Quantization steps are
 * perceptually scaled per subband (see dwtQuantStep).
 */
Image ImageCodec::processChannelDWT(const Image& channel, bool isChroma)
{
    const int W_orig = channel.width();
    const int H_orig = channel.height();

    std::vector<double> buf;
    int W = 0, H = 0, levels = 0;
    transformChannelDWT(channel, buf, W, H, levels);

    // Subband-adaptive quantization; bits are estimated on the integer indices.
    if (m_enableQuantization) {
        EntropyEstimator entropy(3 * levels + 1);
        const double baseStep = DWT_BASE_STEP * qualityScale(m_quality)
                              * (isChroma ? DWT_CHROMA_STEP_SCALE : 1.0);
        for (int y = 0; y < H; ++y) {
            for (int x = 0; x < W; ++x) {
                const double step = dwtQuantStep(x, y, W, H, levels, baseStep);
                double& c = buf[(size_t)y * W + x];
                const double index = std::round(c / step);
                entropy.add(dwtSubbandIndex(x, y, W, H, levels), index);
                c = index * step;
            }
        }
        m_lastBitEstimate += entropy.totalBits();
    }

    const WaveletType wavelet = (m_transformType == TransformType::DWT_97)
                                ? WaveletType::CDF97 : WaveletType::Haar;
    idwtImage(buf.data(), W, H, levels, wavelet);

    // Write back with reverse level shift and pixel-value clamping, cropping back to original size.
    Image result(W_orig, H_orig, 1);
    double* dst = result.data();
    for (int y = 0; y < H_orig; ++y)
        for (int x = 0; x < W_orig; ++x)
            dst[(size_t)y * W_orig + x] = clampPixel(buf[(size_t)y * W + x] + 128.0);

    return result;
}

Image ImageCodec::subbandMap(const Image& channel) const
{
    if (!isWavelet()) return Image();

    const int W_orig = channel.width();
    const int H_orig = channel.height();

    std::vector<double> buf;
    int W = 0, H = 0, levels = 0;
    transformChannelDWT(channel, buf, W, H, levels);

    // Mark which coefficients survive quantization at the current quality.
    std::vector<bool> survives(buf.size(), true);
    if (m_enableQuantization) {
        const double baseStep = DWT_BASE_STEP * qualityScale(m_quality);
        for (int y = 0; y < H; ++y)
            for (int x = 0; x < W; ++x) {
                const double step = dwtQuantStep(x, y, W, H, levels, baseStep);
                survives[(size_t)y * W + x] = std::round(buf[(size_t)y * W + x] / step) != 0.0;
            }
    }

    // LL is shown linearly (it is a thumbnail of the image); detail bands are
    // log-scaled magnitudes so faint high-frequency energy stays visible.
    const int llW = W >> levels;
    const int llH = H >> levels;
    double llMin = 1e300, llMax = -1e300, detailMax = 0.0;
    for (int y = 0; y < H; ++y)
        for (int x = 0; x < W; ++x) {
            const double c = buf[(size_t)y * W + x];
            if (x < llW && y < llH) {
                llMin = std::min(llMin, c);
                llMax = std::max(llMax, c);
            } else {
                detailMax = std::max(detailMax, std::abs(c));
            }
        }
    const double llRange = std::max(1e-9, llMax - llMin);
    const double logDetailMax = std::log1p(std::max(1e-9, detailMax));

    // Coefficients quantized to zero are drawn dimly (so band structure stays
    // readable); surviving ones are drawn brightly.
    const double ZEROED_MAX = 70.0;
    const double SURVIVOR_MIN = 110.0;

    // Resample the padded pyramid onto the channel's own grid.
    Image map(W_orig, H_orig, 1);
    for (int oy = 0; oy < H_orig; ++oy) {
        const int y = static_cast<int>(static_cast<long long>(oy) * H / H_orig);
        for (int ox = 0; ox < W_orig; ++ox) {
            const int x = static_cast<int>(static_cast<long long>(ox) * W / W_orig);
            const size_t i = (size_t)y * W + x;
            const double c = buf[i];
            if (x < llW && y < llH) {
                map.at(ox, oy, 0) = 255.0 * (c - llMin) / llRange;
            } else {
                const double v = std::log1p(std::abs(c)) / logDetailMax;
                map.at(ox, oy, 0) = survives[i] ? SURVIVOR_MIN + (255.0 - SURVIVOR_MIN) * v
                                                : ZEROED_MAX * v;
            }
        }
    }

    // Outline each level's quadrants.
    for (int k = 1; k <= levels; ++k) {
        const int lineX = static_cast<int>(static_cast<long long>(W >> k) * W_orig / W);
        const int lineY = static_cast<int>(static_cast<long long>(H >> k) * H_orig / H);
        const int extentX = static_cast<int>(static_cast<long long>(W >> (k - 1)) * W_orig / W);
        const int extentY = static_cast<int>(static_cast<long long>(H >> (k - 1)) * H_orig / H);
        for (int y = 0; y < std::min(extentY, H_orig); ++y)
            if (lineX < W_orig) map.at(lineX, y, 0) = 255.0;
        for (int x = 0; x < std::min(extentX, W_orig); ++x)
            if (lineY < H_orig) map.at(x, lineY, 0) = 255.0;
    }

    return map;
}

/*
* Downsamples a single channel (Cr or Cb) based on the specified chroma subsampling mode.
* Uses simple averaging for downsampling.
*/
Image ImageCodec::downsampleChannel(const Image& channel, ChromaSubsampling cs) {
    if (cs == ChromaSubsampling::CS_444) {
        return channel; // No subsampling
    }

    const int originalWidth = channel.width();
    const int originalHeight = channel.height();
    const int scaleX = 2; // 4:2:2 and 4:2:0 both halve the width
    const int scaleY = (cs == ChromaSubsampling::CS_420) ? 2 : 1;
    const int newWidth = (originalWidth + scaleX - 1) / scaleX;
    const int newHeight = (originalHeight + scaleY - 1) / scaleY;

    Image downsampled(newWidth, newHeight, 1);

    for (int y = 0; y < newHeight; ++y) {
        for (int x = 0; x < newWidth; ++x) {
            double sum = 0.0;
            int count = 0;
            const int startX = x * scaleX;
            const int startY = y * scaleY;

            for (int sy = startY; sy < startY + scaleY && sy < originalHeight; ++sy) {
                for (int sx = startX; sx < startX + scaleX && sx < originalWidth; ++sx) {
                    sum += channel.at(sx, sy, 0);
                    count++;
                }
            }
            downsampled.at(x, y, 0) = sum / count; // count >= 1: start coords are always in range
        }
    }
    return downsampled;
}

/*
* Upsamples a single channel (Cr or Cb) back to target dimensions using bilinear
* interpolation. Each subsampled value sits at the centre of the 2×1 / 2×2 box
* it was averaged from, so target pixel x maps to source coordinate x/2 - 0.25.
*/
Image ImageCodec::upsampleChannel(const Image& channel, int targetWidth, int targetHeight, ChromaSubsampling cs) const {
    if (cs == ChromaSubsampling::CS_444) {
        return channel; // No upsampling needed
    }

    Image upsampled(targetWidth, targetHeight, 1);
    const int currentWidth = channel.width();
    const int currentHeight = channel.height();
    const bool halveY = (cs == ChromaSubsampling::CS_420);

    // Returns the two source taps and the weight of the second one.
    auto taps = [](int t, bool halved, int srcSize, int& i0, int& i1, double& w) {
        if (!halved) { i0 = i1 = std::min(t, srcSize - 1); w = 0.0; return; }
        const double s = std::max(0.0, t / 2.0 - 0.25);
        i0 = std::min(static_cast<int>(s), srcSize - 1);
        i1 = std::min(i0 + 1, srcSize - 1);
        w = s - static_cast<int>(s);
    };

    for (int y = 0; y < targetHeight; ++y) {
        int y0, y1;
        double wy;
        taps(y, halveY, currentHeight, y0, y1, wy);
        for (int x = 0; x < targetWidth; ++x) {
            int x0, x1;
            double wx;
            taps(x, true, currentWidth, x0, x1, wx);

            const double top    = channel.at(x0, y0, 0) * (1.0 - wx) + channel.at(x1, y0, 0) * wx;
            const double bottom = channel.at(x0, y1, 0) * (1.0 - wx) + channel.at(x1, y1, 0) * wx;
            upsampled.at(x, y, 0) = top * (1.0 - wy) + bottom * wy;
        }
    }
    return upsampled;
}

/*
* Main processing function that takes a BGR image, converts it to YCrCb, processes each channel, and then converts it back to BGR.
*/
Image ImageCodec::process(const Image& bgrImage)
{
    m_lastBitEstimate = 0.0; // Reset for new process
    Image ycrcbImage = bgrToYCrCb(bgrImage);

    Image Y_orig (bgrImage.width(), bgrImage.height(), 1);
    Image Cr_orig(bgrImage.width(), bgrImage.height(), 1);
    Image Cb_orig(bgrImage.width(), bgrImage.height(), 1);

    const size_t numPixels = static_cast<size_t>(bgrImage.width()) * bgrImage.height(); // Total pixels in original image
    const double* ycrcbData = ycrcbImage.data();
    double* yData = Y_orig.data();
    double* crData = Cr_orig.data();
    double* cbData = Cb_orig.data();

    // Split channels
    for (size_t i = 0; i < numPixels; ++i) {
        yData[i]  = *ycrcbData++;
        crData[i] = *ycrcbData++;
        cbData[i] = *ycrcbData++;
    }

    auto codeChannel = [this](const Image& ch, bool isChroma) {
        if (isWavelet()) return processChannelDWT(ch, isChroma);
        return processChannel(ch, isChroma ? m_chromaQuantTable : m_lumaQuantTable);
    };

    // Process Y channel (always at full resolution)
    Image reconY = codeChannel(Y_orig, false);

    Image reconCr_final;
    Image reconCb_final;

    if (m_chromaSubsampling == ChromaSubsampling::CS_444) {
        reconCr_final = codeChannel(Cr_orig, true);
        reconCb_final = codeChannel(Cb_orig, true);
    } else {
        // Downsample, code, and upsample Cr and Cb back to original dimensions
        Image reconCr_sub = codeChannel(downsampleChannel(Cr_orig, m_chromaSubsampling), true);
        Image reconCb_sub = codeChannel(downsampleChannel(Cb_orig, m_chromaSubsampling), true);
        reconCr_final = upsampleChannel(reconCr_sub, bgrImage.width(), bgrImage.height(), m_chromaSubsampling);
        reconCb_final = upsampleChannel(reconCb_sub, bgrImage.width(), bgrImage.height(), m_chromaSubsampling);
    }

    // Merge channels
    Image merged(bgrImage.width(),
                 bgrImage.height(),
                 3);

    double* mergedData = merged.data();
    const double* reconYData = reconY.data();
    const double* reconCrData = reconCr_final.data();
    const double* reconCbData = reconCb_final.data();

    for (size_t i = 0; i < numPixels; ++i) {
        *mergedData++ = reconYData[i];
        *mergedData++ = reconCrData[i];
        *mergedData++ = reconCbData[i];
    }

    return ycrcbToBgr(merged);
}

ImageCodec::BlockDebugData ImageCodec::inspectBlock(const Image& channel, int blockX, int blockY, bool isChroma) {
    // Full-image DWT has no 8×8 block structure; return zeroed data.
    if (isWavelet()) {
        BlockDebugData empty = {};
        return empty;
    }

    BlockDebugData data;
    const double (*quantTable)[8] = isChroma ? m_chromaQuantTable : m_lumaQuantTable;

    // 1. Copy Quantization Table
    for(int i=0; i<8; ++i) {
        for(int j=0; j<8; ++j) {
            data.quantTable[i][j] = quantTable[i][j];
        }
    }

    // 2. Extract Original Block. Partial blocks at the right/bottom edges are
    // padded by edge replication, exactly as processChannel codes them.
    const int startX = blockX * 8;
    const int startY = blockY * 8;
    const double* channelData = channel.data();
    const int width = channel.width();
    const int height = channel.height();

    for(int i=0; i<8; ++i) {
        const int y = std::max(0, std::min(startY + i, height - 1));
        for(int j=0; j<8; ++j) {
            const int x = std::max(0, std::min(startX + j, width - 1));
            data.original[i][j] = channelData[y * width + x];
        }
    }

    // 3. Forward transform
    double blockCentered[8][8];
    for(int i=0; i<8; ++i)
        for(int j=0; j<8; ++j)
            blockCentered[i][j] = data.original[i][j] - 128.0;

    dct8x8(blockCentered, data.coefficients);

    // 4. Quantization
    if (m_enableQuantization) {
        for(int i=0; i<8; ++i) {
            for(int j=0; j<8; ++j) {
                double coeff = data.coefficients[i][j] / quantTable[i][j];
                data.quantized[i][j] = std::round(coeff); // Store integer index
            }
        }
    } else {
         for(int i=0; i<8; ++i)
            for(int j=0; j<8; ++j)
                data.quantized[i][j] = data.coefficients[i][j];
    }

    // 5. Dequantization & inverse transform (Reconstruction)
    double dequantized[8][8];
    for(int i=0; i<8; ++i) {
        for(int j=0; j<8; ++j) {
            if (m_enableQuantization)
                dequantized[i][j] = data.quantized[i][j] * quantTable[i][j];
            else
                dequantized[i][j] = data.quantized[i][j];
        }
    }

    double reconBlock[8][8];
    idct8x8(dequantized, reconBlock);

    for(int i=0; i<8; ++i)
        for(int j=0; j<8; ++j)
            data.reconstructed[i][j] = reconBlock[i][j] + 128.0;

    return data;
}
