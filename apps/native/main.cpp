#include <iostream>
#include <opencv2/opencv.hpp>
#include <iomanip>
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