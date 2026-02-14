#include "utils.h"

#include <opencv2/opencv.hpp>
#include <cmath> // For log10

double computePSNR(const cv::Mat& I1, const cv::Mat& I2) {
    cv::Mat diff;
    cv::absdiff(I1, I2, diff);
    diff = diff.mul(diff);

    double mse = cv::sum(diff)[0] / (double)(I1.total());
    if (mse <= 1e-10) return 100.0;

    return 10.0 * log10((255.0 * 255.0) / mse);
}