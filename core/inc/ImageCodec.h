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
* ImageCodec class encapsulates the functionality for compressing and decompressing images using DCT and quantization.
* It allows for adjustable quality settings and can use either OpenCV's built-in DCT functions or custom implementations.
*/
class ImageCodec {
public:
    /*
    * Constructs an ImageCodec with the specified quality, quantization, and DCT options.
    * @param quality Quality factor for quantization (1-100). Higher means better quality.
    * @param enableQuantization Whether to apply quantization to DCT coefficients.    
    */
    explicit ImageCodec(double quality, 
                        bool enableQuantization = true);

    
    Image process(const Image& bgrImage);

    double getPSNRY()  const { return m_psnrY; }
    double getPSNRCb() const { return m_psnrCb; }
    double getPSNRCr() const { return m_psnrCr; }

private:
    double m_quality;
    bool   m_enableQuantization;

    double m_lumaQuantTable[8][8];
    double m_chromaQuantTable[8][8];

    double m_psnrY = 0.0;
    double m_psnrCb = 0.0;
    double m_psnrCr = 0.0;

    void generateQuantizationTables();
    Image processChannel(const Image& channel,
                         const double quantTable[8][8]);
};


#endif
