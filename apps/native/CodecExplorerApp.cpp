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

// --- UI Helper Function ---
void drawOverlay(cv::Mat& display, int quality, const CodecMetrics& metrics) {
    std::vector<std::string> lines;
    lines.push_back("Quality: " + std::to_string(quality));
    
    std::ostringstream oss;
    oss << std::fixed << std::setprecision(2);
    
    oss.str(""); oss << "PSNR (Y):  " << metrics.psnrY << " dB"; lines.push_back(oss.str());
    oss.str(""); oss << "PSNR (Cr): " << metrics.psnrCr << " dB"; lines.push_back(oss.str());
    oss.str(""); oss << "PSNR (Cb): " << metrics.psnrCb << " dB"; lines.push_back(oss.str());

    // Draw text with a shadow for readability
    int y = 30;
    for (const auto& line : lines) {
        cv::putText(display, line, {21, y + 1}, cv::FONT_HERSHEY_SIMPLEX, 0.7, {0,0,0}, 2); // Shadow
        cv::putText(display, line, {20, y},     cv::FONT_HERSHEY_SIMPLEX, 0.7, {0,255,0}, 2); // Text
        y += 30;
    }
}

CodecExplorerApp::CodecExplorerApp(const std::string& imagePath) {
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
    if (key == 'p')      { m_state.mode = AppState::ViewMode::RGB;       viewChanged = true; }
    else if (key == 'a') { m_state.mode = AppState::ViewMode::Artifacts; viewChanged = true; }
    else if (key == 'y') { m_state.mode = AppState::ViewMode::Y;         viewChanged = true; }
    else if (key == 'r') { m_state.mode = AppState::ViewMode::Cr;        viewChanged = true; }
    else if (key == 'b') { m_state.mode = AppState::ViewMode::Cb;        viewChanged = true; }

    if (viewChanged) {
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
    ImageCodec codec(m_quality);
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
            drawOverlay(processedCvMat, m_quality, m_state.metrics);
            rightLabel = "Processed (RGB)";
            break;
        case AppState::ViewMode::Artifacts:
            processedCvMat = CvAdapter::imageToCvMat(m_state.metrics.artifactMap);
            rightLabel = "Artifact Map";
            break;
        case AppState::ViewMode::Y:
        case AppState::ViewMode::Cr:
        case AppState::ViewMode::Cb: {
            Image channel(m_state.originalImage.width(), m_state.originalImage.height(), 1);
            const double* ycrcbData = m_state.processedYCrCb.data();
            double* channelData = channel.data();
            int channelOffset = (m_state.mode == AppState::ViewMode::Y) ? 0 : (m_state.mode == AppState::ViewMode::Cr ? 1 : 2);

            if (m_state.mode == AppState::ViewMode::Y) rightLabel = "Y Channel";
            else if (m_state.mode == AppState::ViewMode::Cr) rightLabel = "Cr Channel";
            else rightLabel = "Cb Channel";

            for (size_t i = 0; i < channel.size(); ++i) {
                channelData[i] = ycrcbData[i * 3 + channelOffset];
            }
            processedCvMat = CvAdapter::imageToCvMat(channel);
            cv::cvtColor(processedCvMat, processedCvMat, cv::COLOR_GRAY2BGR);
            break;
        }
    }

    cv::Mat combinedView;
    cv::hconcat(m_state.originalCvMat, processedCvMat, combinedView);

    int footerHeight = 70;
    cv::Mat viewWithFooter(combinedView.rows + footerHeight, combinedView.cols, combinedView.type(), cv::Scalar(20, 20, 20));
    combinedView.copyTo(viewWithFooter(cv::Rect(0, 0, combinedView.cols, combinedView.rows)));

    cv::Scalar labelColor(220, 220, 220);
    cv::putText(viewWithFooter, "Original", {10, combinedView.rows + 28}, cv::FONT_HERSHEY_SIMPLEX, 0.8, labelColor, 2);
    cv::putText(viewWithFooter, rightLabel, {m_state.originalCvMat.cols + 10, combinedView.rows + 28}, cv::FONT_HERSHEY_SIMPLEX, 0.8, labelColor, 2);
    cv::putText(viewWithFooter, "View: [P]rocessed | [A]rtifacts | [Y] | C[r] | C[b]", {10, combinedView.rows + 56}, cv::FONT_HERSHEY_SIMPLEX, 0.6, {150, 150, 150}, 1);

    cv::imshow(m_state.windowName, viewWithFooter);
}