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


ImageCodec::ImageCodec(double quality, bool enableQuantization, ChromaSubsampling cs, TransformType transform)
    : m_quality(quality),
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
    double scale;

    if (m_quality < 50.0)
        scale = 5000.0 / m_quality;
    else
        scale = 200.0 - 2.0 * m_quality;

    scale /= 100.0;

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
* Processes a single channel (Y, Cr, or Cb) by applying DCT, quantization, and inverse DCT.
* The input channel is a custom Image object, and the quantization table is a cv::Mat.
* The output is the reconstructed channel after compression and decompression.
*/
Image ImageCodec::processChannel(const Image& channel,
                                 const double quantTable[8][8])
{
    Image reconstructed(channel.width(),
                        channel.height(),
                        1);

    for (int y = 0; y < channel.height(); y += 8) {
        for (int x = 0; x < channel.width(); x += 8) {

            int blockWidth = std::min(8, channel.width() - x);
            int blockHeight = std::min(8, channel.height() - y);
            if (blockWidth < 8 || blockHeight < 8) {
                // For simplicity, copy boundary blocks without processing.
                // Using std::copy for efficient row-by-row copying.
                const double* channelData = channel.data();
                double* reconData = reconstructed.data();
                const int channelWidth = channel.width();
                for (int i = 0; i < blockHeight; ++i) {
                    const double* src_row = &channelData[(y + i) * channelWidth + x];
                    double* dst_row = &reconData[(y + i) * channelWidth + x];
                    std::copy(src_row, src_row + blockWidth, dst_row);
                }
                continue;
            }

            double block[8][8];
            double dctBlock[8][8];
            double reconBlock[8][8];
            const double* channelData = channel.data();
            const int channelWidth = channel.width();

            // Copy block from Image and level shift
            for (int i = 0; i < 8; ++i)
                for (int j = 0; j < 8; ++j)
                    block[i][j] = channelData[(y + i) * channelWidth + (x + j)] - 128.0;

            if (m_transformType == TransformType::DWT)
                dwt8x8(block, dctBlock);
            else
                dct8x8(block, dctBlock);

            if (m_enableQuantization) {
                for (int i = 0; i < 8; ++i) {
                    for (int j = 0; j < 8; ++j) {
                        double coeff = dctBlock[i][j] / quantTable[i][j];
                        dctBlock[i][j] = std::round(coeff) * quantTable[i][j];
                    }
                }
            }

            if (m_transformType == TransformType::DWT)
                idwt8x8(dctBlock, reconBlock);
            else
                idct8x8(dctBlock, reconBlock);

            double* reconData = reconstructed.data();
            const int reconWidth = reconstructed.width();
            // Write back to Image and reverse level shift
            for (int i = 0; i < 8; ++i)
                for (int j = 0; j < 8; ++j)
                    reconData[(y + i) * reconWidth + (x + j)] =
                        reconBlock[i][j] + 128.0;
        }
    }

    return reconstructed;
}

/*
* Downsamples a single channel (Cr or Cb) based on the specified chroma subsampling mode.
* Uses simple averaging for downsampling.
*/
Image ImageCodec::downsampleChannel(const Image& channel, ChromaSubsampling cs) const {
    if (cs == ChromaSubsampling::CS_444) {
        return channel; // No subsampling
    }

    int originalWidth = channel.width();
    int originalHeight = channel.height();
    int newWidth = originalWidth;
    int newHeight = originalHeight;

    if (cs == ChromaSubsampling::CS_422 || cs == ChromaSubsampling::CS_420) {
        newWidth = (originalWidth + 1) / 2; // Ceiling division
    }
    if (cs == ChromaSubsampling::CS_420) {
        newHeight = (originalHeight + 1) / 2; // Ceiling division
    }

    Image downsampled(newWidth, newHeight, 1);

    for (int y = 0; y < newHeight; ++y) {
        for (int x = 0; x < newWidth; ++x) {
            double sum = 0.0;
            int count = 0;

            // Calculate the top-left corner of the 2x2 or 2x1 block in the original image
            int startX = x * (cs == ChromaSubsampling::CS_444 ? 1 : 2);
            int startY = y * (cs == ChromaSubsampling::CS_420 ? 2 : 1);

            // Calculate the bottom-right corner (exclusive) of the block
            int endX = startX + (cs == ChromaSubsampling::CS_444 ? 1 : 2);
            int endY = startY + (cs == ChromaSubsampling::CS_420 ? 2 : 1);

            for (int sy = startY; sy < endY && sy < originalHeight; ++sy) {
                for (int sx = startX; sx < endX && sx < originalWidth; ++sx) {
                    sum += channel.at(sx, sy, 0);
                    count++;
                }
            }
            if (count > 0) {
                downsampled.at(x, y, 0) = sum / count;
            } else {
                // Fallback for edge cases where no pixels are covered (should ideally not happen with correct dimensions)
                downsampled.at(x, y, 0) = channel.at(std::min(startX, originalWidth - 1), std::min(startY, originalHeight - 1), 0);
            }
        }
    }
    return downsampled;
}

/*
* Upsamples a single channel (Cr or Cb) back to target dimensions using nearest-neighbor interpolation.
*/
Image ImageCodec::upsampleChannel(const Image& channel, int targetWidth, int targetHeight, ChromaSubsampling cs) const {
    if (cs == ChromaSubsampling::CS_444) {
        return channel; // No upsampling needed
    }

    Image upsampled(targetWidth, targetHeight, 1);
    int currentWidth = channel.width();
    int currentHeight = channel.height();

    for (int y = 0; y < targetHeight; ++y) {
        for (int x = 0; x < targetWidth; ++x) {
            int srcX = x;
            int srcY = y;

            if (cs == ChromaSubsampling::CS_422 || cs == ChromaSubsampling::CS_420) {
                srcX /= 2;
            }
            if (cs == ChromaSubsampling::CS_420) {
                srcY /= 2;
            }
            
            // Clamp to valid source coordinates
            srcX = std::min(srcX, currentWidth - 1);
            srcY = std::min(srcY, currentHeight - 1);

            upsampled.at(x, y, 0) = channel.at(srcX, srcY, 0);
        }
    }
    return upsampled;
}

/*
* Main processing function that takes a BGR image, converts it to YCrCb, processes each channel, and then converts it back to BGR.
*/
Image ImageCodec::process(const Image& bgrImage)
{
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

    // Process Y channel (always at full resolution)
    Image reconY = processChannel(Y_orig, m_lumaQuantTable);

    Image reconCr_final;
    Image reconCb_final;

    if (m_chromaSubsampling == ChromaSubsampling::CS_444) {
        reconCr_final = processChannel(Cr_orig, m_chromaQuantTable);
        reconCb_final = processChannel(Cb_orig, m_chromaQuantTable);
    } else {
        // Downsample Cr and Cb
        Image downsampledCr = downsampleChannel(Cr_orig, m_chromaSubsampling);
        Image downsampledCb = downsampleChannel(Cb_orig, m_chromaSubsampling);

        // Process subsampled Cr and Cb
        Image reconCr_sub = processChannel(downsampledCr, m_chromaQuantTable);
        Image reconCb_sub = processChannel(downsampledCb, m_chromaQuantTable);

        // Upsample Cr and Cb back to original dimensions
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
    BlockDebugData data;
    const double (*quantTable)[8] = isChroma ? m_chromaQuantTable : m_lumaQuantTable;

    // 1. Copy Quantization Table
    for(int i=0; i<8; ++i) {
        for(int j=0; j<8; ++j) {
            data.quantTable[i][j] = quantTable[i][j];
        }
    }

    // 2. Extract Original Block
    // Ensure we don't go out of bounds
    int startX = blockX * 8;
    int startY = blockY * 8;
    
    // Fill with zeros first
    for(int i=0; i<8; ++i) 
        for(int j=0; j<8; ++j) 
            data.original[i][j] = 0.0;

    const double* channelData = channel.data();
    int width = channel.width();
    int height = channel.height();

    for(int i=0; i<8; ++i) {
        for(int j=0; j<8; ++j) {
            int y = startY + i;
            int x = startX + j;
            if (x < width && y < height) {
                data.original[i][j] = channelData[y * width + x];
            }
        }
    }

    // 3. Forward transform
    double blockCentered[8][8];
    for(int i=0; i<8; ++i)
        for(int j=0; j<8; ++j)
            blockCentered[i][j] = data.original[i][j] - 128.0;

    if (m_transformType == TransformType::DWT)
        dwt8x8(blockCentered, data.coefficients);
    else
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
    if (m_transformType == TransformType::DWT)
        idwt8x8(dequantized, reconBlock);
    else
        idct8x8(dequantized, reconBlock);

    for(int i=0; i<8; ++i)
        for(int j=0; j<8; ++j)
            data.reconstructed[i][j] = reconBlock[i][j] + 128.0;

    return data;
}