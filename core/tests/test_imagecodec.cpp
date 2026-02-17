#include <gtest/gtest.h>
#include "ImageCodec.h"
#include "CodecAnalysis.h"
#include "Image.h"
#include <cmath>

// Helper to create a simple test image (gradient)
Image createTestImage(int width, int height) {
    Image img(width, height, 3);
    double* data = img.data();
    for (int y = 0; y < height; ++y) {
        for (int x = 0; x < width; ++x) {
            int idx = (y * width + x) * 3;
            data[idx + 0] = static_cast<double>(x % 256); // B
            data[idx + 1] = static_cast<double>(y % 256); // G
            data[idx + 2] = static_cast<double>((x + y) % 256); // R
        }
    }
    return img;
}

TEST(ImageCodecTest, ProcessDimensions) {
    int w = 64;
    int h = 64;
    Image input = createTestImage(w, h);
    
    // Default 4:4:4
    ImageCodec codec(90.0);
    Image output = codec.process(input);
    
    EXPECT_EQ(output.width(), w);
    EXPECT_EQ(output.height(), h);
    EXPECT_EQ(output.channels(), 3);
}

TEST(ImageCodecTest, QualityImpact) {
    int w = 32;
    int h = 32;
    Image input = createTestImage(w, h);
    
    // Low quality
    ImageCodec lowQualCodec(10.0);
    Image lowQualOutput = lowQualCodec.process(input);
    
    // High quality
    ImageCodec highQualCodec(90.0);
    Image highQualOutput = highQualCodec.process(input);
    
    // Measure PSNR
    CodecMetrics lowMetrics = CodecAnalysis::computeMetrics(input, lowQualOutput);
    CodecMetrics highMetrics = CodecAnalysis::computeMetrics(input, highQualOutput);
    
    // High quality should have better (higher) PSNR than low quality
    // We check Y channel specifically as it's the most significant
    EXPECT_GT(highMetrics.psnrY, lowMetrics.psnrY);
    EXPECT_GT(highMetrics.psnrY, 20.0); // Basic sanity check
}

TEST(ImageCodecTest, SubsamplingModes) {
    int w = 32;
    int h = 32;
    Image input = createTestImage(w, h); // Multiple of 2 for clean 4:2:0 subsampling
    
    // 4:4:4
    {
        ImageCodec codec(80.0, true, ImageCodec::ChromaSubsampling::CS_444);
        Image output = codec.process(input);
        EXPECT_EQ(output.width(), w);
        EXPECT_EQ(output.height(), h);
        CodecMetrics metrics = CodecAnalysis::computeMetrics(input, output);
        EXPECT_GT(metrics.psnrY, 30.0);
    }
    
    // 4:2:2
    {
        ImageCodec codec(80.0, true, ImageCodec::ChromaSubsampling::CS_422);
        Image output = codec.process(input);
        EXPECT_EQ(output.width(), w);
        EXPECT_EQ(output.height(), h);
        CodecMetrics metrics = CodecAnalysis::computeMetrics(input, output);
        EXPECT_GT(metrics.psnrY, 30.0);
    }
    
    // 4:2:0
    {
        ImageCodec codec(80.0, true, ImageCodec::ChromaSubsampling::CS_420);
        Image output = codec.process(input);
        EXPECT_EQ(output.width(), w);
        EXPECT_EQ(output.height(), h);
        CodecMetrics metrics = CodecAnalysis::computeMetrics(input, output);
        EXPECT_GT(metrics.psnrY, 30.0);
    }
}
