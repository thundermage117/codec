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
#include "ImageCodec.h"
#include "CodecAnalysis.h"
#include "colorspace.h"
#include <opencv2/opencv.hpp>
#include <string>


class CodecExplorerApp {
public:
    CodecExplorerApp(const std::string& imagePath, 
                     ImageCodec::ChromaSubsampling csMode = ImageCodec::ChromaSubsampling::CS_444);
    void run();

private:
    struct AppState {
        enum class ViewMode { RGB, Y, Cr, Cb, Artifacts };

        Image originalImage;
        cv::Mat originalCvMat;
        std::string windowName;
        ViewMode mode = ViewMode::RGB;
        Image processedYCrCb;
        CodecMetrics metrics;
    };

    void handleKey(int key);
    void updateCodecOutput();
    void render();
    static void onQualityChangeStatic(int quality, void* userdata);
    void onQualityChange(int quality);

    AppState m_state;
    int m_quality = 50;
    ImageCodec::ChromaSubsampling m_chromaSubsampling;
    bool m_useTint = true;
};