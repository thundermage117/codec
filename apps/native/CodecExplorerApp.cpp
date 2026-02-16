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
#include "CodecExplorerApp.h"
#include "CodecAnalysis.h"
#include "CvAdapter.h"
#include "colorspace.h"
#include <opencv2/opencv.hpp>
#include <stdexcept>
#include <algorithm>
#include <iomanip>
#include <sstream>

// --- UI Helper Function ---
static void drawMetricsDashboard(cv::Mat& display, int x, int y, const CodecMetrics& metrics) {
    auto fmt = [](double val) {
        std::ostringstream oss;
        oss << std::fixed << std::setprecision(3) << val;
        return oss.str();
    };

    cv::Scalar headColor(0, 255, 0);
    cv::Scalar valColor(255, 255, 255);
    cv::Scalar labelColor(180, 180, 180);
    
    float fontScale = 0.5;
    int thickness = 1;
    int colWidth = 90;
    int rowHeight = 25;

    // Headers
    cv::putText(display, "METRIC", {x, y}, cv::FONT_HERSHEY_SIMPLEX, fontScale, labelColor, thickness);
    cv::putText(display, "Y", {x + 110, y}, cv::FONT_HERSHEY_SIMPLEX, fontScale, headColor, thickness + 1);
    cv::putText(display, "Cr", {x + 110 + colWidth, y}, cv::FONT_HERSHEY_SIMPLEX, fontScale, headColor, thickness + 1);
    cv::putText(display, "Cb", {x + 110 + 2*colWidth, y}, cv::FONT_HERSHEY_SIMPLEX, fontScale, headColor, thickness + 1);

    // Divider line
    cv::line(display, {x, y + 8}, {x + 380, y + 8}, cv::Scalar(60, 60, 60), 1);

    // PSNR Row
    cv::putText(display, "PSNR (dB)", {x, y + rowHeight}, cv::FONT_HERSHEY_SIMPLEX, fontScale, labelColor, thickness);
    cv::putText(display, fmt(metrics.psnrY), {x + 110, y + rowHeight}, cv::FONT_HERSHEY_SIMPLEX, fontScale, valColor, thickness);
    cv::putText(display, fmt(metrics.psnrCr), {x + 110 + colWidth, y + rowHeight}, cv::FONT_HERSHEY_SIMPLEX, fontScale, valColor, thickness);
    cv::putText(display, fmt(metrics.psnrCb), {x + 110 + 2*colWidth, y + rowHeight}, cv::FONT_HERSHEY_SIMPLEX, fontScale, valColor, thickness);

    // SSIM Row
    cv::putText(display, "SSIM", {x, y + 2*rowHeight}, cv::FONT_HERSHEY_SIMPLEX, fontScale, labelColor, thickness);
    cv::putText(display, fmt(metrics.ssimY), {x + 110, y + 2*rowHeight}, cv::FONT_HERSHEY_SIMPLEX, fontScale, valColor, thickness);
    cv::putText(display, fmt(metrics.ssimCr), {x + 110 + colWidth, y + 2*rowHeight}, cv::FONT_HERSHEY_SIMPLEX, fontScale, valColor, thickness);
    cv::putText(display, fmt(metrics.ssimCb), {x + 110 + 2*colWidth, y + 2*rowHeight}, cv::FONT_HERSHEY_SIMPLEX, fontScale, valColor, thickness);
}

CodecExplorerApp::CodecExplorerApp(const std::string& imagePath, ImageCodec::ChromaSubsampling csMode)
    : m_chromaSubsampling(csMode) {
    m_state.windowName = "Codec Explorer";
    m_state.originalCvMat = cv::imread(imagePath, cv::IMREAD_COLOR);
    if (m_state.originalCvMat.empty()) {
        throw std::runtime_error("Error: Could not load image: " + imagePath);
    }
    m_state.originalImage = CvAdapter::cvMatToImage(m_state.originalCvMat);

    // Create UI
    cv::namedWindow(m_state.windowName, cv::WINDOW_AUTOSIZE);
    // Per OpenCV warning, use nullptr for the value pointer and set the position manually.
    cv::createTrackbar("Quality", m_state.windowName, nullptr, 100, onQualityChangeStatic, this);
    cv::setTrackbarPos("Quality", m_state.windowName, m_quality);
}

void CodecExplorerApp::run() {
    updateCodecOutput(); // Initial processing
    render();            // Initial render

    while (true) {
        int key = cv::waitKey(30);
        if (key == 27) { // ESC to exit
            break;
        }
        handleKey(key);
    }
}

void CodecExplorerApp::handleKey(int key) {
    bool viewChanged = false;
    bool codecChanged = false;

    if (key == 'p')      { m_state.mode = AppState::ViewMode::RGB;       viewChanged = true; }
    else if (key == 'a') { m_state.mode = AppState::ViewMode::Artifacts; viewChanged = true; }
    else if (key == 'y') { m_state.mode = AppState::ViewMode::Y;         viewChanged = true; }
    else if (key == 'r') { m_state.mode = AppState::ViewMode::Cr;        viewChanged = true; }
    else if (key == 'b') { m_state.mode = AppState::ViewMode::Cb;        viewChanged = true; }
    else if (key == 't') { m_useTint = !m_useTint;                      viewChanged = true; }
    else if (key == '4') { m_chromaSubsampling = ImageCodec::ChromaSubsampling::CS_444; codecChanged = true; }
    else if (key == '2') { m_chromaSubsampling = ImageCodec::ChromaSubsampling::CS_422; codecChanged = true; }
    else if (key == '0') { m_chromaSubsampling = ImageCodec::ChromaSubsampling::CS_420; codecChanged = true; }


    if (codecChanged) {
        updateCodecOutput();
        render();
    } else if (viewChanged) {
        render();
    }
}

void CodecExplorerApp::onQualityChangeStatic(int quality, void* userdata) {
    auto* app = static_cast<CodecExplorerApp*>(userdata);
    if (app) {
        app->onQualityChange(quality);
    }
}

void CodecExplorerApp::onQualityChange(int quality) {
    m_quality = std::max(1, quality);
    updateCodecOutput();
    render();
}

void CodecExplorerApp::updateCodecOutput() {
    ImageCodec codec(m_quality, true, m_chromaSubsampling);
    Image processedImage = codec.process(m_state.originalImage);
    m_state.metrics = CodecAnalysis::computeMetrics(m_state.originalImage, processedImage);
    m_state.processedYCrCb = bgrToYCrCb(processedImage);
}

void CodecExplorerApp::render() {
    cv::Mat processedCvMat;
    std::string rightLabel;

    switch (m_state.mode) {
        case AppState::ViewMode::RGB:
            // Convert from cached YCrCb back to BGR for display
            processedCvMat = CvAdapter::imageToCvMat(ycrcbToBgr(m_state.processedYCrCb));
            rightLabel = "Processed (RGB)";
            break;
        case AppState::ViewMode::Artifacts:
            processedCvMat = CvAdapter::imageToCvMat(m_state.metrics.artifactMap);
            rightLabel = "Artifact Map";
            break;
        case AppState::ViewMode::Y:
        case AppState::ViewMode::Cr:
        case AppState::ViewMode::Cb: {
            int width = m_state.originalImage.width();
            int height = m_state.originalImage.height();
            Image tinted(width, height, 3);
            const double* ycrcbData = m_state.processedYCrCb.data();
            double* tintedData = tinted.data();
            int channelOffset = (m_state.mode == AppState::ViewMode::Y) ? 0 : (m_state.mode == AppState::ViewMode::Cr ? 1 : 2);

            if (m_state.mode == AppState::ViewMode::Y) rightLabel = "Y Channel";
            else if (m_state.mode == AppState::ViewMode::Cr) rightLabel = "Cr Channel";
            else rightLabel = "Cb Channel";

            for (size_t i = 0; i < (size_t)width * height; ++i) {
                double val = ycrcbData[i * 3 + channelOffset];
                if (m_state.mode == AppState::ViewMode::Y) {
                    tintedData[i * 3 + 0] = val; // B
                    tintedData[i * 3 + 1] = val; // G
                    tintedData[i * 3 + 2] = val; // R
                } else if (m_state.mode == AppState::ViewMode::Cr && m_useTint) {
                    tintedData[i * 3 + 0] = 128.0; // B
                    tintedData[i * 3 + 1] = 128.0; // G
                    tintedData[i * 3 + 2] = val;   // R
                } else if (m_state.mode == AppState::ViewMode::Cb && m_useTint) {
                    tintedData[i * 3 + 0] = val;   // B
                    tintedData[i * 3 + 1] = 128.0; // G
                    tintedData[i * 3 + 2] = 128.0; // R
                } else {
                    // Grayscale for Cr/Cb if tint is disabled
                    tintedData[i * 3 + 0] = val;
                    tintedData[i * 3 + 1] = val;
                    tintedData[i * 3 + 2] = val;
                }
            }
            processedCvMat = CvAdapter::imageToCvMat(tinted);
            break;
        }
    }

    cv::Mat combinedView;
    cv::hconcat(m_state.originalCvMat, processedCvMat, combinedView);

    int footerHeight = 180;
    cv::Mat viewWithFooter(combinedView.rows + footerHeight, combinedView.cols, combinedView.type(), cv::Scalar(25, 25, 25));
    combinedView.copyTo(viewWithFooter(cv::Rect(0, 0, combinedView.cols, combinedView.rows)));

    // Footer divider
    cv::line(viewWithFooter, {0, combinedView.rows}, {viewWithFooter.cols, combinedView.rows}, cv::Scalar(60, 60, 60), 1);

    cv::Scalar labelColor(220, 220, 220);
    cv::putText(viewWithFooter, "Original", {10, combinedView.rows + 30}, cv::FONT_HERSHEY_SIMPLEX, 0.8, labelColor, 2);
    cv::putText(viewWithFooter, rightLabel, {m_state.originalCvMat.cols + 10, combinedView.rows + 30}, cv::FONT_HERSHEY_SIMPLEX, 0.8, labelColor, 2);

    int yBase = combinedView.rows + 70;
    
    // Status info
    std::string cs_str = "Chroma: ";
    switch(m_chromaSubsampling) {
        case ImageCodec::ChromaSubsampling::CS_444: cs_str += "4:4:4"; break;
        case ImageCodec::ChromaSubsampling::CS_422: cs_str += "4:2:2"; break;
        case ImageCodec::ChromaSubsampling::CS_420: cs_str += "4:2:0"; break;
    }
    cv::putText(viewWithFooter, "Quality: " + std::to_string(m_quality), {10, yBase}, cv::FONT_HERSHEY_SIMPLEX, 0.6, {0, 255, 0}, 1);
    cv::putText(viewWithFooter, cs_str, {10, yBase + 25}, cv::FONT_HERSHEY_SIMPLEX, 0.6, {0, 255, 0}, 1);

    // Controls help
    cv::putText(viewWithFooter, "View: [P] RGB | [A] Artifacts | [Y] | C[b] | C[r] | [T]int", {10, yBase + 55}, cv::FONT_HERSHEY_SIMPLEX, 0.55, {160, 160, 160}, 1);
    cv::putText(viewWithFooter, "Mode: 4:4:[4] | 4:2:[2] | 4:2:[0] | [ESC] Exit", {10, yBase + 80}, cv::FONT_HERSHEY_SIMPLEX, 0.55, {160, 160, 160}, 1);

    // Metrics Dashboard
    int dashboardX = std::max(m_state.originalCvMat.cols + 10, viewWithFooter.cols - 400);
    drawMetricsDashboard(viewWithFooter, dashboardX, yBase, m_state.metrics);

    cv::imshow(m_state.windowName, viewWithFooter);
}