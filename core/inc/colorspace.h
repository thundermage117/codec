#pragma once
#include "Image.h"

// Converts a BGR Image to YCrCb colorspace.
Image bgrToYCrCb(const Image& bgrImage);

// Converts a YCrCb Image to BGR colorspace.
Image ycrcbToBgr(const Image& ycrcbImage);