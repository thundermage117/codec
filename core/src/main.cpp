#include <iostream>
#include <opencv2/opencv.hpp>
#include "ImageCodec.h"

cv::Mat g_original;
cv::Mat g_display;
int g_quality = 90;

// Trackbar callback
void onQualityChange(int, void*) {

    int q = std::max(g_quality, 1);

    ImageCodec codec(q, true);
    g_display = codec.process(g_original);

    double psnrY = codec.getPSNRY();

    // Clone so we don't overwrite original reconstructed data
    cv::Mat displayWithText = g_display.clone();

    std::string text1 = "Quality: " + std::to_string(q);
    std::string text2 = "PSNR (Y): " + std::to_string(psnrY) + " dB";

    int font = cv::FONT_HERSHEY_SIMPLEX;
    double scale = 0.7;
    int thickness = 2;

    // Position text near bottom-left
    cv::putText(displayWithText, text1,
                cv::Point(20, displayWithText.rows - 40),
                font, scale, cv::Scalar(0,255,0), thickness);

    cv::putText(displayWithText, text2,
                cv::Point(20, displayWithText.rows - 10),
                font, scale, cv::Scalar(0,255,0), thickness);

    cv::imshow("Reconstructed", displayWithText);
}


int main(int argc, char** argv) {

    std::string imagePath = (argc >= 2) ? argv[1] : "../images/0.png";

    g_original = cv::imread(imagePath, cv::IMREAD_COLOR);
    if (g_original.empty()) {
        std::cerr << "Failed to load image: " << imagePath << "\n";
        return -1;
    }

    cv::namedWindow("Reconstructed", cv::WINDOW_AUTOSIZE);

    // Create slider
    cv::createTrackbar("Quality", "Reconstructed",
                       &g_quality, 100, onQualityChange);

    // Initial render
    onQualityChange(0, nullptr);

    cv::imshow("Original", g_original);

    cv::waitKey(0);
    return 0;
}
