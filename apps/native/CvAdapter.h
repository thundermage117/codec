/*
 * Codec Explorer: An interactive codec laboratory.
 * Copyright (C) 2026 Abhinav Tanniru
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
#pragma once

#include <opencv2/opencv.hpp>
#include "Image.h"

class CvAdapter {
public:
    static Image cvMatToImage(const cv::Mat& mat);
    static cv::Mat imageToCvMat(const Image& img);
};