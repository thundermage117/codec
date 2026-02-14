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
#include <iostream>
#include <opencv2/opencv.hpp>
#include <iomanip>
#include <string>
#include "ImageCodec.h"

// Global state to keep the callback simple
cv::Mat g_original;
Image g_originalImage(1, 1, 1); // Pre-converted Image object
cv::Mat g_display;

// Optimized Mat to Image conversion using row pointers
Image cvMatToImage(const cv::Mat& mat) {
    if (mat.empty()) throw std::invalid_argument("Empty Mat");
    
    int rows = mat.rows;
    int cols = mat.cols;
    int channels = mat.channels();
    Image img(cols, rows, channels);
    double* imgData = img.data();

    for (int y = 0; y < rows; ++y) {
        const uchar* rowPtr = mat.ptr<uchar>(y);
        double* imgRowStart = imgData + (static_cast<size_t>(y) * cols * channels);
        for (int i = 0; i < cols * channels; ++i) {
            imgRowStart[i] = static_cast<double>(rowPtr[i]);
        }
    }
    return img;
}

// Optimized Image to Mat conversion
cv::Mat imageToCvMat(const Image& img) {
    if (img.width() == 0 || img.height() == 0) return cv::Mat();

    cv::Mat mat(img.height(), img.width(), CV_8UC(img.channels()));
    const double* imgData = img.data();
    for (int y = 0; y < img.height(); ++y) {
        uchar* rowPtr = mat.ptr<uchar>(y);
        const double* imgRowStart = imgData + (static_cast<size_t>(y) * img.width() * img.channels());
        for (int i = 0; i < img.width() * img.channels(); ++i) {
            rowPtr[i] = cv::saturate_cast<uchar>(imgRowStart[i]);
        }
    }
    return mat;
}

void onQualityChange(int, void*) {
    int q = cv::getTrackbarPos("Quality", "Reconstructed");
    q = std::max(q, 1); 

    // Core Processing
    ImageCodec codec(q);
    Image processedImage = codec.process(g_originalImage); 
    g_display = imageToCvMat(processedImage);

    // Metadata Overlay
    double psnrY = codec.getPSNRY();
    cv::Mat displayWithText = g_display.clone();

    std::ostringstream oss;
    oss << std::fixed << std::setprecision(2) << psnrY << " dB";
    
    std::string text1 = "Quality: " + std::to_string(q);
    std::string text2 = "PSNR (Y): " + oss.str();

    cv::putText(displayWithText, text1, cv::Point(20, 30), 
                cv::FONT_HERSHEY_SIMPLEX, 0.7, cv::Scalar(0, 255, 0), 2);
    cv::putText(displayWithText, text2, cv::Point(20, 60), 
                cv::FONT_HERSHEY_SIMPLEX, 0.7, cv::Scalar(0, 255, 0), 2);

    cv::imshow("Reconstructed", displayWithText);
}

int main(int argc, char** argv) {

    std::cout << "Codec Explorer  Copyright (C) 2026  Abhinav Tanniru\n"
                 "This program comes with ABSOLUTELY NO WARRANTY; for details type `show w'.\n"
                 "This is free software, and you are welcome to redistribute it\n"
                 "under certain conditions; type `show c' for details.\n"
              << std::endl;

    // --- Argument Parsing ---
    if (argc > 1) {
        std::string arg1 = argv[1];

        if (arg1 == "help" || arg1 == "--help" || arg1 == "-h") {
            std::cout << "Usage:\n"
                      << "  " << argv[0] << " [path_to_image]\n"
                      << "  " << argv[0] << " show w\n"
                      << "  " << argv[0] << " show c\n"
                      << "  " << argv[0] << " help\n\n"
                      << "An interactive codec laboratory to visualize image compression.\n\n"
                      << "Options:\n"
                      << "  [path_to_image]   Optional. Path to the image file to process.\n"
                      << "                    Defaults to '../images/0.png' if not provided.\n"
                      << "  show w            Display the GPL warranty disclaimer and exit.\n"
                      << "  show c            Display the GPL redistribution conditions and exit.\n"
                      << "  help, --help, -h  Show this help message and exit.\n" << std::endl;
            return 0;
        }

        if (arg1 == "show") {
            if (argc == 3) {
                std::string arg2 = argv[2];
                if (arg2 == "w") {
                    std::cout << "--- Warranty Disclaimer (from GPL v3, Sections 15 & 16) ---\n\n"
                                 "THERE IS NO WARRANTY FOR THE PROGRAM, TO THE EXTENT PERMITTED BY\n"
                                 "APPLICABLE LAW. EXCEPT WHEN OTHERWISE STATED IN WRITING THE COPYRIGHT\n"
                                 "HOLDERS AND/OR OTHER PARTIES PROVIDE THE PROGRAM \"AS IS\" WITHOUT WARRANTY\n"
                                 "OF ANY KIND, EITHER EXPRESSED OR IMPLIED, INCLUDING, BUT NOT LIMITED TO,\n"
                                 "THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR\n"
                                 "PURPOSE. THE ENTIRE RISK AS TO THE QUALITY AND PERFORMANCE OF THE PROGRAM\n"
                                 "IS WITH YOU. SHOULD THE PROGRAM PROVE DEFECTIVE, YOU ASSUME THE COST OF\n"
                                 "ALL NECESSARY SERVICING, REPAIR OR CORRECTION.\n\n"
                                 "IN NO EVENT UNLESS REQUIRED BY APPLICABLE LAW OR AGREED TO IN WRITING\n"
                                 "WILL ANY COPYRIGHT HOLDER, OR ANY OTHER PARTY WHO MODIFIES AND/OR CONVEYS\n"
                                 "THE PROGRAM AS PERMITTED ABOVE, BE LIABLE TO YOU FOR DAMAGES, INCLUDING ANY\n"
                                 "GENERAL, SPECIAL, INCIDENTAL OR CONSEQUENTIAL DAMAGES ARISING OUT OF THE\n"
                                 "USE OR INABILITY TO USE THE PROGRAM (INCLUDING BUT NOT LIMITED TO LOSS OF\n"
                                 "DATA OR DATA BEING RENDERED INACCURATE OR LOSSES SUSTAINED BY YOU OR THIRD\n"
                                 "PARTIES OR A FAILURE OF THE PROGRAM TO OPERATE WITH ANY OTHER PROGRAMS),\n"
                                 "EVEN IF SUCH HOLDER OR OTHER PARTY HAS BEEN ADVISED OF THE POSSIBILITY OF\n"
                                 "SUCH DAMAGES.\n" << std::endl;
                    return 0;
                }
                if (arg2 == "c") {
                    std::cout << "--- Conditions for Redistribution (Summary of GPL v3) ---\n\n"
                                 "This program is licensed under the GNU GPL v3. You are welcome to\n"
                                 "redistribute it under certain conditions. Key conditions include:\n\n"
                                 "- If you convey verbatim copies of the source code, you must keep all\n"
                                 "  copyright and license notices intact and provide recipients with a\n"
                                 "  copy of the GPL. (Section 4)\n\n"
                                 "- If you convey modified versions, you must mark your changes, license\n"
                                 "  the entire work under the GPL, and provide the source code.\n"
                                 "  (Sections 5 & 6)\n\n"
                                 "For the full terms and conditions, please see the LICENSE file.\n" << std::endl;
                    return 0;
                }
            }
            std::cerr << "Invalid command. Use 'show w' or 'show c', or 'help' for more info." << std::endl;
            return 1;
        }
    }

    std::string imagePath = (argc >= 2) ? argv[1] : "../images/0.png";

    g_original = cv::imread(imagePath, cv::IMREAD_COLOR);
    if (g_original.empty()) {
        std::cerr << "Error: Could not load image!" << std::endl;
        return -1;
    }

    // CRITICAL: Overwrite the global dummy with the actual loaded data
    // This calls the assignment operator/move constructor
    g_originalImage = cvMatToImage(g_original); 

    cv::namedWindow("Reconstructed", cv::WINDOW_AUTOSIZE);
    cv::createTrackbar("Quality", "Reconstructed", nullptr, 100, onQualityChange);

    // Initial call
    cv::setTrackbarPos("Quality", "Reconstructed", 50);
    onQualityChange(50, nullptr);

    cv::imshow("Original", g_original);
    cv::waitKey(0);
    return 0;
}