#include <gtest/gtest.h>
#include "CodecAnalysis.h"
#include "Image.h"
#include <cmath>

// Helper to create a flat color image
Image createFlatImage(int width, int height, double r, double g, double b) {
    Image img(width, height, 3);
    double* data = img.data();
    for (int i = 0; i < width * height; ++i) {
        data[i * 3 + 0] = b;
        data[i * 3 + 1] = g;
        data[i * 3 + 2] = r;
    }
    return img;
}

TEST(CodecAnalysisTest, PSNR_Identical) {
    Image img = createFlatImage(16, 16, 100.0, 100.0, 100.0);
    double psnr = CodecAnalysis::computePSNR(img, img);
    // Expect very high PSNR (capped at 100.0 in implementation for perfect match)
    EXPECT_GE(psnr, 99.0);
}

TEST(CodecAnalysisTest, PSNR_Different) {
    Image img1 = createFlatImage(16, 16, 100.0, 100.0, 100.0);
    Image img2 = createFlatImage(16, 16, 110.0, 110.0, 110.0); // Slightly different
    
    double psnr = CodecAnalysis::computePSNR(img1, img2);
    // Should be finite and less than perfect
    EXPECT_LT(psnr, 99.0);
    EXPECT_GT(psnr, 0.0);
}

TEST(CodecAnalysisTest, SSIM_Identical) {
    Image img = createFlatImage(16, 16, 100.0, 100.0, 100.0);
    double ssim = CodecAnalysis::computeSSIM(img, img);
    EXPECT_DOUBLE_EQ(ssim, 1.0);
}

TEST(CodecAnalysisTest, SSIM_Different) {
    Image img1 = createFlatImage(16, 16, 0.0, 0.0, 0.0);
    Image img2 = createFlatImage(16, 16, 255.0, 255.0, 255.0);
    
    double ssim = CodecAnalysis::computeSSIM(img1, img2);
    EXPECT_LT(ssim, 1.0);
    EXPECT_GE(ssim, 0.0);
}

TEST(CodecAnalysisTest, ArtifactMap_Dimensions) {
    Image img1 = createFlatImage(20, 20, 100.0, 100.0, 100.0);
    Image img2 = createFlatImage(20, 20, 105.0, 105.0, 105.0);
    
    Image artifact = CodecAnalysis::computeArtifactMap(img1, img2);
    EXPECT_EQ(artifact.width(), 20);
    EXPECT_EQ(artifact.height(), 20);
    EXPECT_EQ(artifact.channels(), 3);
}

TEST(CodecAnalysisTest, ComputeMetrics_Structure) {
    Image img1 = createFlatImage(16, 16, 100.0, 50.0, 25.0);
    Image img2 = createFlatImage(16, 16, 100.0, 50.0, 25.0);
    
    CodecMetrics metrics = CodecAnalysis::computeMetrics(img1, img2);
    
    EXPECT_GE(metrics.psnrY, 99.0);
    EXPECT_GE(metrics.psnrCr, 99.0);
    EXPECT_GE(metrics.psnrCb, 99.0);
    EXPECT_DOUBLE_EQ(metrics.ssimY, 1.0);
    EXPECT_DOUBLE_EQ(metrics.ssimCr, 1.0);
    EXPECT_DOUBLE_EQ(metrics.ssimCb, 1.0);
}
