
#include "transform.h"
#include <cmath>

const double PI = 3.14159265358979323846;

static double C(int u) {
    return (u == 0) ? (1.0 / std::sqrt(2.0)) : 1.0;
}

void dct8x8(const cv::Mat& src, cv::Mat& dst) {
    for (int u = 0; u < 8; ++u) {
        for (int v = 0; v < 8; ++v) {
            double sum = 0.0;
            for (int x = 0; x < 8; ++x) {
                for (int y = 0; y < 8; ++y) {
                    sum += src.at<double>(x, y) *
                           std::cos(((2 * x + 1) * u * PI) / 16.0) *
                           std::cos(((2 * y + 1) * v * PI) / 16.0);
                }
            }
            dst.at<double>(u, v) = 0.25 * C(u) * C(v) * sum;
        }
    }
}

void idct8x8(const cv::Mat& src, cv::Mat& dst) {
    for (int x = 0; x < 8; ++x) {
        for (int y = 0; y < 8; ++y) {
            double sum = 0.0;
            for (int u = 0; u < 8; ++u) {
                for (int v = 0; v < 8; ++v) {
                    sum += C(u) * C(v) * src.at<double>(u, v) *
                           std::cos(((2 * x + 1) * u * PI) / 16.0) *
                           std::cos(((2 * y + 1) * v * PI) / 16.0);
                }
            }
            dst.at<double>(x, y) = 0.25 * sum;
        }
    }
}
