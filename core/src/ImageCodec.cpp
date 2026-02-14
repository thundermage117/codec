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
#include "utils.h"
#include "colorspace.h"

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


ImageCodec::ImageCodec(double quality, bool enableQuantization)
    : m_quality(quality),
      m_enableQuantization(enableQuantization)
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

            dct8x8(block, dctBlock);

            if (m_enableQuantization) {
                for (int i = 0; i < 8; ++i) {
                    for (int j = 0; j < 8; ++j) {
                        double coeff = dctBlock[i][j] / quantTable[i][j];
                        dctBlock[i][j] = std::round(coeff) * quantTable[i][j];
                    }
                }
            }

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
* Main processing function that takes a BGR image, converts it to YCrCb, processes each channel, and then converts it back to BGR.
*/
Image ImageCodec::process(const Image& bgrImage)
{
    Image ycrcbImage = bgrToYCrCb(bgrImage);

    Image Y (bgrImage.width(), bgrImage.height(), 1);
    Image Cr(bgrImage.width(), bgrImage.height(), 1);
    Image Cb(bgrImage.width(), bgrImage.height(), 1);

    const size_t numPixels = static_cast<size_t>(bgrImage.width()) * bgrImage.height();
    const double* ycrcbData = ycrcbImage.data();
    double* yData = Y.data();
    double* crData = Cr.data();
    double* cbData = Cb.data();

    // Split channels
    for (size_t i = 0; i < numPixels; ++i) {
        yData[i]  = *ycrcbData++;
        crData[i] = *ycrcbData++;
        cbData[i] = *ycrcbData++;
    }

    Image reconY  = processChannel(Y,  m_lumaQuantTable);
    Image reconCr = processChannel(Cr, m_chromaQuantTable);
    Image reconCb = processChannel(Cb, m_chromaQuantTable);

    // Compute PSNR (requires converting channels back to cv::Mat for the utility function)
    m_psnrY  = computePSNR(Y, reconY);
    m_psnrCr = computePSNR(Cr, reconCr);
    m_psnrCb = computePSNR(Cb, reconCb);

    // Merge channels
    Image merged(bgrImage.width(),
                 bgrImage.height(),
                 3);
    
    double* mergedData = merged.data();
    const double* reconYData = reconY.data();
    const double* reconCrData = reconCr.data();
    const double* reconCbData = reconCb.data();

    for (size_t i = 0; i < numPixels; ++i) {
        *mergedData++ = reconYData[i];
        *mergedData++ = reconCrData[i];
        *mergedData++ = reconCbData[i];
    }

    return ycrcbToBgr(merged);
}