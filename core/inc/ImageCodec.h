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
#ifndef IMAGE_PROCESSOR_H
#define IMAGE_PROCESSOR_H

#include "Image.h"

/*
* ImageCodec class encapsulates the functionality for compressing and decompressing images using
* a block transform (DCT or Haar DWT) and quantization.
* It allows for adjustable quality settings and configurable transform type.
*/
class ImageCodec {
public:
    enum class ChromaSubsampling {
        CS_444, // No subsampling
        CS_422, // Horizontal subsampling by 2 for Cr, Cb
        CS_420  // Horizontal and vertical subsampling by 2 for Cr, Cb
    };

    enum class TransformType {
        DCT, // Discrete Cosine Transform (JPEG-style)
        DWT  // Haar Discrete Wavelet Transform
    };

public:
    /*
    * Constructs an ImageCodec with the specified quality, quantization, and transform options.
    * @param quality Quality factor for quantization (1-100). Higher means better quality.
    * @param enableQuantization Whether to apply quantization to transform coefficients.
    * @param cs Chroma subsampling mode (default: 4:4:4).
    * @param transform Transform type to use (default: DCT).
    */
    explicit ImageCodec(double quality,
                        bool enableQuantization = true,
                        ChromaSubsampling cs = ChromaSubsampling::CS_444,
                        TransformType transform = TransformType::DCT);

    Image process(const Image& bgrImage);

private:
    double m_quality;
    bool   m_enableQuantization;

    double m_lumaQuantTable[8][8];
    double m_chromaQuantTable[8][8];

    ChromaSubsampling m_chromaSubsampling;
    TransformType     m_transformType;

    double m_lastBitEstimate = 0.0; // Total bits estimated in the last process() call

    void generateQuantizationTables();
    Image processChannel(const Image& channel,
                         const double quantTable[8][8]);
    Image processChannelDWT(const Image& channel);
    Image downsampleChannel(const Image& channel, ChromaSubsampling cs) const;
    Image upsampleChannel(const Image& channel, int targetWidth, int targetHeight, ChromaSubsampling cs) const;

public:
    struct BlockDebugData {
        double original[8][8];
        double coefficients[8][8]; // Transform coefficients (DCT or DWT)
        double quantTable[8][8];
        double quantized[8][8];
        double reconstructed[8][8];
    };

    BlockDebugData inspectBlock(const Image& channel, int blockX, int blockY, bool isChroma = false);

    double getLastBitEstimate() const { return m_lastBitEstimate; }
};

#endif
