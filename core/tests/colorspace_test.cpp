#include <gtest/gtest.h>
#include "colorspace.h"
#include "Image.h"

TEST(ColorspaceTest, BGRToYCrCb_Conversion) {
    // Pure Red BGR: (0, 0, 255)
    // Wikipedia/Formula check:
    // Y  =  0.299R + 0.587G + 0.114B
    // Cb = -0.1687R - 0.3313G + 0.5B + 128
    // Cr =  0.5R - 0.4187G - 0.0813B + 128
    
    // For R=255, G=0, B=0:
    // Y  = 0.299 * 255 = 76.245
    // Cb = -0.1687 * 255 + 128 = -43.0185 + 128 = 84.9815
    // Cr = 0.5 * 255 + 128 = 127.5 + 128 = 255.5
    
    Image bgr(1, 1, 3);
    bgr.at(0, 0, 0) = 0.0;   // B
    bgr.at(0, 0, 1) = 0.0;   // G
    bgr.at(0, 0, 2) = 255.0; // R
    
    Image ycrcb = bgrToYCrCb(bgr);
    
    EXPECT_NEAR(ycrcb.at(0, 0, 0), 76.245, 1.0);
    EXPECT_NEAR(ycrcb.at(0, 0, 1), 255.5, 1.0);
    EXPECT_NEAR(ycrcb.at(0, 0, 2), 84.9815, 1.0);
    
    // Note: The order of Cr/Cb in the output Image depends on the implementation.
    // Usually OpenCV uses YCrCb -> (Y, Cr, Cb).
    // Let's verify if the implementation follows that or YCbCr.
    // I assumed index 1 is Cr and 2 is Cb based on name YCrCb.
    // If test fails, I will check implementation.
}

TEST(ColorspaceTest, RoundTrip) {
    Image bgr(2, 2, 3);
    // Fill with random-ish values
    bgr.at(0, 0, 0) = 100.0; bgr.at(0, 0, 1) = 50.0;  bgr.at(0, 0, 2) = 200.0;
    bgr.at(1, 0, 0) = 10.0;  bgr.at(1, 0, 1) = 250.0; bgr.at(1, 0, 2) = 100.0;
    bgr.at(0, 1, 0) = 255.0; bgr.at(0, 1, 1) = 255.0; bgr.at(0, 1, 2) = 255.0;
    bgr.at(1, 1, 0) = 0.0;   bgr.at(1, 1, 1) = 0.0;   bgr.at(1, 1, 2) = 0.0;
    
    Image ycrcb = bgrToYCrCb(bgr);
    Image backToBgr = ycrcbToBgr(ycrcb);
    
    EXPECT_EQ(backToBgr.width(), 2);
    EXPECT_EQ(backToBgr.height(), 2);
    EXPECT_EQ(backToBgr.channels(), 3);
    
    for (int y = 0; y < 2; ++y) {
        for (int x = 0; x < 2; ++x) {
            for (int c = 0; c < 3; ++c) {
                EXPECT_NEAR(backToBgr.at(x, y, c), bgr.at(x, y, c), 1.0) 
                    << "Mismatch at (" << x << "," << y << "," << c << ")";
            }
        }
    }
}
