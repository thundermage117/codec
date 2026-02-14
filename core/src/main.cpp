#include <iostream>
#include <opencv2/opencv.hpp>
#include "processing.h"
#include "utils.h"

int main(int argc, char** argv) {

    std::string imagePath = (argc >= 2) ? argv[1] : "../images/0.png";

    cv::Mat img = cv::imread(imagePath, cv::IMREAD_COLOR);
    if (img.empty()) {
        std::cerr << "Failed to load image: " << imagePath << "\n";
        return -1;
    }

    double psnrY, psnrCb, psnrCr;
    cv::Mat reconstructed_bgr = processColorImage(img, psnrY, psnrCb, psnrCr);

    std::cout << "PSNR (Y channel): " << psnrY << " dB\n";
    std::cout << "PSNR (Cb channel): " << psnrCb << " dB\n";
    std::cout << "PSNR (Cr channel): " << psnrCr << " dB\n";


    cv::imshow("Original", img);
    cv::imshow("Reconstructed (No Quantization)", reconstructed_bgr);
    cv::waitKey(0);

    return 0;
}
