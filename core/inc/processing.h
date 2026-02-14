#pragma once

#ifndef PROCESSING_H
#define PROCESSING_H

#include <opencv2/core/mat.hpp>

// Processes a single channel image (CV_64F) by applying DCT and IDCT on 8x8 blocks.
cv::Mat identityTransform(const cv::Mat& channel);

// Processes a 3-channel BGR color image and calculates the PSNR of the Y channel.
cv::Mat processColorImage(const cv::Mat& bgrImage, double& outPsnrY, double& outPsnrCb, double& outPsnrCr);

#endif