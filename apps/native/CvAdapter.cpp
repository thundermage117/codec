/*
 * Codec Explorer: An interactive codec laboratory.
 * Copyright (C) 2026 Abhinav Tanniru
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
#include "CvAdapter.h"
#include <stdexcept>

// Optimized Mat to Image conversion using row pointers
Image CvAdapter::cvMatToImage(const cv::Mat& mat) {
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
cv::Mat CvAdapter::imageToCvMat(const Image& img) {
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