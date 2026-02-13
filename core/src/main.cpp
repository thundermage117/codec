#include <iostream>
#include <opencv2/opencv.hpp>

int main(int argc, char** argv) {

    std::string imagePath;

    if (argc >= 2) {
        imagePath = argv[1];
    } else {
        imagePath = "../images/0.png";  // default image
        std::cout << "No image provided. Using default: "
                  << imagePath << std::endl;
    }

    cv::Mat img = cv::imread(imagePath, cv::IMREAD_COLOR);

    if (img.empty()) {
        std::cerr << "Failed to load image: "
                  << imagePath << std::endl;
        return -1;
    }

    cv::Mat gray;
    cv::cvtColor(img, gray, cv::COLOR_BGR2GRAY);

    gray.convertTo(gray, CV_64F);

    std::cout << "Image loaded: "
              << gray.rows << " x "
              << gray.cols << std::endl;

    return 0;
}
