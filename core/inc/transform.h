#ifndef TRANSFORM_H
#define TRANSFORM_H

#include <opencv2/opencv.hpp>

void dct8x8(const cv::Mat& src, cv::Mat& dst);
void idct8x8(const cv::Mat& src, cv::Mat& dst);

#endif // TRANSFORM_H
