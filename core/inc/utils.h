#pragma once

#ifndef UTILS_H
#define UTILS_H

#include <opencv2/core/mat.hpp>

double computePSNR(const cv::Mat& I1, const cv::Mat& I2);

#endif