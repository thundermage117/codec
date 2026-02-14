#include <iostream>
#include <opencv2/opencv.hpp>
#include "ImageCodec.h"

// The core codec library is OpenCV-free. These adapter functions bridge
// the gap between the OpenCV-based main application (for I/O and display)
// and the custom `Image` class used by the codec.

Image cvMatToImage(const cv::Mat& mat) {
    if (mat.empty() || (mat.type() != CV_8UC3 && mat.type() != CV_8UC1)) {
        throw std::invalid_argument("cvMatToImage expects a non-empty CV_8UC1 or CV_8UC3 cv::Mat");
    }
    Image img(mat.cols, mat.rows, mat.channels());
    for (int y = 0; y < mat.rows; ++y) {
        for (int x = 0; x < mat.cols; ++x) {
            if (mat.channels() == 1) {
                img.at(x, y, 0) = static_cast<double>(mat.at<uchar>(y, x));
            } else {
                cv::Vec3b pixel = mat.at<cv::Vec3b>(y, x);
                for (int c = 0; c < mat.channels(); ++c) {
                    // OpenCV stores as BGR, so access is pixel[c]
                    img.at(x, y, c) = static_cast<double>(pixel[c]);
                }
            }
        }
    }
    return img;
}

cv::Mat imageToCvMat(const Image& img) {
    if (img.width() == 0 || img.height() == 0) {
        return cv::Mat();
    }
    cv::Mat mat(img.height(), img.width(), CV_8UC(img.channels()));
    for (int y = 0; y < img.height(); ++y) {
        for (int x = 0; x < img.width(); ++x) {
            if (img.channels() == 1) {
                 mat.at<uchar>(y, x) = cv::saturate_cast<uchar>(img.at(x, y, 0));
            } else { // Assuming 3 channels
                cv::Vec3b& pixel = mat.at<cv::Vec3b>(y, x);
                for (int c = 0; c < img.channels(); ++c) {
                    pixel[c] = cv::saturate_cast<uchar>(img.at(x, y, c));
                }
            }
        }
    }
    return mat;
}

cv::Mat g_original;
cv::Mat g_display;

// Trackbar callback
void onQualityChange(int, void*) {
    int q = cv::getTrackbarPos("Quality", "Reconstructed");
    q = std::max(q, 1);  // Prevent 0

    ImageCodec codec(q);
    Image originalImage = cvMatToImage(g_original);
    Image processedImage = codec.process(originalImage);
    g_display = imageToCvMat(processedImage);

    double psnrY = codec.getPSNRY();

    cv::Mat displayWithText = g_display.clone();

    std::ostringstream oss;
    oss << std::fixed << std::setprecision(2) << psnrY;

    std::string text1 = "Quality: " + std::to_string(q);
    std::string text2 = "PSNR (Y): " + oss.str() + " dB";

    cv::putText(displayWithText, text1,
                cv::Point(20, displayWithText.rows - 40),
                cv::FONT_HERSHEY_SIMPLEX, 0.7,
                cv::Scalar(0,255,0), 2);

    cv::putText(displayWithText, text2,
                cv::Point(20, displayWithText.rows - 10),
                cv::FONT_HERSHEY_SIMPLEX, 0.7,
                cv::Scalar(0,255,0), 2);

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
                   nullptr, 100, onQualityChange);

    // Initial render
    onQualityChange(0, nullptr);

    cv::imshow("Original", g_original);

    cv::waitKey(0);
    return 0;
}
