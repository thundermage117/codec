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
#include <vector>

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
        DCT,      // 8×8 block Discrete Cosine Transform (JPEG-style)
        DWT_HAAR, // Full-image Haar Discrete Wavelet Transform
        DWT_97    // Full-image CDF 9/7 Discrete Wavelet Transform (JPEG 2000)
    };

public:
    /*
    * Constructs an ImageCodec with the specified quality, quantization, and transform options.
    * @param quality Quality factor for quantization, clamped to [1, 100]. Higher means better quality.
    * @param enableQuantization Whether to apply quantization to transform coefficients.
    * @param cs Chroma subsampling mode (default: 4:4:4).
    * @param transform Transform type to use (default: DCT).
    */
    explicit ImageCodec(double quality,
                        bool enableQuantization = true,
                        ChromaSubsampling cs = ChromaSubsampling::CS_444,
                        TransformType transform = TransformType::DCT);

    Image process(const Image& bgrImage);

    /*
    * Forward-transforms and quantizes a single channel with the configured
    * wavelet and returns a displayable map of its subband pyramid (LL in the
    * top-left, log-scaled detail magnitudes elsewhere; coefficients that
    * quantize to zero are drawn dim), resampled to the channel's size. Returns an empty Image for TransformType::DCT.
    */
    Image subbandMap(const Image& channel) const;

    bool isWavelet() const { return m_transformType != TransformType::DCT; }

    /*
    * Distribution of a channel's AC / detail coefficients (DC and LL excluded)
    * under this codec's transform, before quantization. The channel is treated
    * as luma (DCT uses the luma quantization table).
    *   histogram[0]   — fraction with |c| < 1
    *   histogram[b]   — fraction with 2^(b-1) <= |c| < 2^b; the last bin is open-ended
    *   zeroFraction   — fraction that quantize to zero at this codec's quality
    */
    struct CoefficientStats {
        static constexpr int NUM_BINS = 12;
        double histogram[NUM_BINS] = {};
        double zeroFraction = 0.0;
    };

    CoefficientStats coefficientStats(const Image& channel) const;

    /*
    * Downsamples a chroma channel by box-averaging (2×1 for 4:2:2, 2×2 for 4:2:0).
    */
    static Image downsampleChannel(const Image& channel, ChromaSubsampling cs);

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
    Image processChannelDWT(const Image& channel, bool isChroma);
    void transformChannelDWT(const Image& channel, std::vector<double>& coeffs,
                              int& paddedW, int& paddedH, int& levels) const;
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
