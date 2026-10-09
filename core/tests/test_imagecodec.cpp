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

// Helper: single-channel image filled with a constant value
static Image createUniformChannel(int width, int height, double value) {
    Image img(width, height, 1);
    double* d = img.data();
    for (int i = 0; i < width * height; ++i)
        d[i] = value;
    return img;
}

// Helper: single-channel image with varied pixel values
static Image createGradientChannel(int width, int height) {
    Image img(width, height, 1);
    double* d = img.data();
    for (int i = 0; i < width * height; ++i)
        d[i] = static_cast<double>(i % 200 + 28); // [28, 227]
    return img;
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

// ── process() tests ────────────────────────────────────────────────────────

TEST(ImageCodecTest, ProcessOutputPixelRange) {
    // ycrcbToBgr clamps to [0,255]; verify every output pixel is within range
    Image input = createTestImage(64, 64);
    ImageCodec codec(50.0);
    Image output = codec.process(input);

    const double* data = output.data();
    int total = output.width() * output.height() * output.channels();
    for (int i = 0; i < total; ++i) {
        EXPECT_GE(data[i], 0.0)   << "Pixel " << i << " is below 0";
        EXPECT_LE(data[i], 255.0) << "Pixel " << i << " is above 255";
    }
}

TEST(ImageCodecTest, ProcessNoQuantizationNearLossless) {
    // With quantization disabled, DCT + IDCT round-trip should be essentially lossless
    Image input = createTestImage(64, 64);
    ImageCodec codec(50.0, /*enableQuantization=*/false);
    Image output = codec.process(input);

    CodecMetrics metrics = CodecAnalysis::computeMetrics(input, output);
    EXPECT_GT(metrics.psnrY, 60.0);
}

TEST(ImageCodecTest, ProcessSingleBlock) {
    // 8x8 image = exactly one block; should process without errors
    Image input = createTestImage(8, 8);
    ImageCodec codec(80.0);
    Image output = codec.process(input);

    EXPECT_EQ(output.width(), 8);
    EXPECT_EQ(output.height(), 8);
    EXPECT_EQ(output.channels(), 3);

    CodecMetrics metrics = CodecAnalysis::computeMetrics(input, output);
    EXPECT_GT(metrics.psnrY, 25.0);
}

TEST(ImageCodecTest, ProcessNonMultipleOf8) {
    // Dimensions not divisible by 8; partial boundary blocks are padded and coded
    Image input = createTestImage(13, 11);
    ImageCodec codec(80.0);
    Image output = codec.process(input);

    EXPECT_EQ(output.width(), 13);
    EXPECT_EQ(output.height(), 11);
    EXPECT_EQ(output.channels(), 3);
}

TEST(ImageCodecTest, ProcessHighQualityNearLossless) {
    // Quality 95 should yield very high PSNR (minimal quantization loss)
    Image input = createTestImage(64, 64);
    ImageCodec codec(95.0);
    Image output = codec.process(input);

    CodecMetrics metrics = CodecAnalysis::computeMetrics(input, output);
    EXPECT_GT(metrics.psnrY, 40.0);
}

TEST(ImageCodecTest, ProcessChromaLossOrdering) {
    // Chroma fidelity must be: CS_444 >= CS_422 >= CS_420
    Image input = createTestImage(64, 64);
    const double quality = 80.0;

    ImageCodec codec444(quality, true, ImageCodec::ChromaSubsampling::CS_444);
    ImageCodec codec422(quality, true, ImageCodec::ChromaSubsampling::CS_422);
    ImageCodec codec420(quality, true, ImageCodec::ChromaSubsampling::CS_420);

    CodecMetrics m444 = CodecAnalysis::computeMetrics(input, codec444.process(input));
    CodecMetrics m422 = CodecAnalysis::computeMetrics(input, codec422.process(input));
    CodecMetrics m420 = CodecAnalysis::computeMetrics(input, codec420.process(input));

    EXPECT_GE(m444.psnrCr, m422.psnrCr);
    EXPECT_GE(m422.psnrCr, m420.psnrCr);
}

// ── inspectBlock() tests ───────────────────────────────────────────────────

TEST(ImageCodecTest, InspectBlockQuantTableMinValue) {
    // generateQuantizationTables() clamps each entry to max(1.0, ...) — verify this
    Image channel = createUniformChannel(16, 16, 128.0);
    ImageCodec codec(50.0);
    auto debug = codec.inspectBlock(channel, 0, 0, /*isChroma=*/false);

    for (int i = 0; i < 8; ++i)
        for (int j = 0; j < 8; ++j)
            EXPECT_GE(debug.quantTable[i][j], 1.0)
                << "quantTable[" << i << "][" << j << "] < 1";
}

TEST(ImageCodecTest, InspectBlockLumaVsChromaTable) {
    // Luma (BASE_LUMA) and chroma (BASE_CHROMA) tables differ; verify via inspectBlock
    Image channel = createUniformChannel(8, 8, 128.0);
    ImageCodec codec(50.0);
    auto lumaDebug   = codec.inspectBlock(channel, 0, 0, /*isChroma=*/false);
    auto chromaDebug = codec.inspectBlock(channel, 0, 0, /*isChroma=*/true);

    bool anyDifference = false;
    for (int i = 0; i < 8 && !anyDifference; ++i)
        for (int j = 0; j < 8 && !anyDifference; ++j)
            if (lumaDebug.quantTable[i][j] != chromaDebug.quantTable[i][j])
                anyDifference = true;
    EXPECT_TRUE(anyDifference);
}

TEST(ImageCodecTest, InspectBlockDCDominatesForUniform) {
    // A constant-value block has zero energy in all AC DCT coefficients
    Image channel = createUniformChannel(8, 8, 200.0);
    ImageCodec codec(50.0, /*enableQuantization=*/false);
    auto debug = codec.inspectBlock(channel, 0, 0, /*isChroma=*/false);

    for (int i = 0; i < 8; ++i)
        for (int j = 0; j < 8; ++j)
            if (i != 0 || j != 0)
                EXPECT_NEAR(debug.coefficients[i][j], 0.0, 1e-6)
                    << "AC coefficient [" << i << "][" << j << "] not near zero";
}

TEST(ImageCodecTest, InspectBlockQuantizedAreIntegers) {
    // With quantization enabled, quantized[] stores integer indices: round(dct / Q)
    Image channel = createGradientChannel(8, 8);
    ImageCodec codec(50.0, /*enableQuantization=*/true);
    auto debug = codec.inspectBlock(channel, 0, 0, /*isChroma=*/false);

    for (int i = 0; i < 8; ++i)
        for (int j = 0; j < 8; ++j)
            EXPECT_NEAR(debug.quantized[i][j], std::round(debug.quantized[i][j]), 1e-9)
                << "quantized[" << i << "][" << j << "] is not an integer";
}

TEST(ImageCodecTest, InspectBlockQuantizationRelationship) {
    // quantized[i][j] == round(dct[i][j] / quantTable[i][j])
    Image channel = createGradientChannel(8, 8);
    ImageCodec codec(75.0, /*enableQuantization=*/true);
    auto debug = codec.inspectBlock(channel, 0, 0, /*isChroma=*/false);

    for (int i = 0; i < 8; ++i)
        for (int j = 0; j < 8; ++j) {
            double expected = std::round(debug.coefficients[i][j] / debug.quantTable[i][j]);
            EXPECT_NEAR(debug.quantized[i][j], expected, 1e-9)
                << "At [" << i << "][" << j << "]";
        }
}

TEST(ImageCodecTest, InspectBlockOriginalPixelsMatch) {
    // original[row][col] must match channel.at(col, row, 0) for block (0,0)
    Image channel = createGradientChannel(16, 16);
    ImageCodec codec(80.0);
    auto debug = codec.inspectBlock(channel, 0, 0, /*isChroma=*/false);

    for (int i = 0; i < 8; ++i)
        for (int j = 0; j < 8; ++j)
            EXPECT_DOUBLE_EQ(debug.original[i][j], channel.at(j, i, 0))
                << "Mismatch at pixel [row=" << i << "][col=" << j << "]";
}

TEST(ImageCodecTest, InspectBlockHigherQualityLowerQuantTable) {
    // Higher quality → smaller quantization steps → smaller quant table sum
    Image channel = createUniformChannel(8, 8, 128.0);
    ImageCodec lowQualCodec(10.0);
    ImageCodec highQualCodec(90.0);

    auto lowDebug  = lowQualCodec.inspectBlock(channel, 0, 0, /*isChroma=*/false);
    auto highDebug = highQualCodec.inspectBlock(channel, 0, 0, /*isChroma=*/false);

    double lowSum = 0.0, highSum = 0.0;
    for (int i = 0; i < 8; ++i)
        for (int j = 0; j < 8; ++j) {
            lowSum  += lowDebug.quantTable[i][j];
            highSum += highDebug.quantTable[i][j];
        }
    EXPECT_GT(lowSum, highSum);
}

// Deterministic noisy image: a hard case for quantization at every position.
static Image createNoiseImage(int width, int height) {
    Image img(width, height, 3);
    unsigned state = 12345u;
    double* data = img.data();
    for (size_t i = 0; i < img.size(); ++i) {
        state = state * 1103515245u + 12345u;
        data[i] = static_cast<double>((state >> 16) % 256);
    }
    return img;
}

static const ImageCodec::TransformType ALL_TRANSFORMS[] = {
    ImageCodec::TransformType::DCT,
    ImageCodec::TransformType::DWT_HAAR,
    ImageCodec::TransformType::DWT_97,
};

TEST(ImageCodecTest, PartialEdgeBlocksAreCoded) {
    // 12×12: the right/bottom 4-pixel strips are partial 8×8 blocks. They used
    // to be copied through untouched; now heavy quantization must alter them.
    Image input = createNoiseImage(12, 12);
    ImageCodec codec(1.0);
    Image output = codec.process(input);

    int changed = 0;
    for (int y = 0; y < 12; ++y)
        for (int x = 8; x < 12; ++x)
            for (int c = 0; c < 3; ++c)
                if (std::abs(output.at(x, y, c) - input.at(x, y, c)) > 1.0) ++changed;
    EXPECT_GT(changed, 0);
}

TEST(ImageCodecTest, OutputStaysInPixelRangeForAllTransforms) {
    Image input = createNoiseImage(37, 29);
    for (auto t : ALL_TRANSFORMS) {
        ImageCodec codec(1.0, true, ImageCodec::ChromaSubsampling::CS_420, t);
        Image output = codec.process(input);
        for (size_t i = 0; i < output.size(); ++i) {
            ASSERT_GE(output.data()[i], 0.0);
            ASSERT_LE(output.data()[i], 255.0);
        }
    }
}

TEST(ImageCodecTest, OutOfRangeQualityIsClamped) {
    Image input = createTestImage(16, 16);
    ImageCodec q1(1.0);
    Image ref = q1.process(input);

    for (double q : {0.0, -5.0}) {
        ImageCodec codec(q);
        Image output = codec.process(input);
        for (size_t i = 0; i < output.size(); ++i) {
            ASSERT_TRUE(std::isfinite(output.data()[i]));
            ASSERT_DOUBLE_EQ(output.data()[i], ref.data()[i]);
        }
    }
}

TEST(ImageCodecTest, BitEstimateGrowsWithQuality) {
    Image input = createNoiseImage(64, 64);
    for (auto t : ALL_TRANSFORMS) {
        double prev = -1.0;
        for (double q : {5.0, 25.0, 50.0, 75.0, 95.0}) {
            ImageCodec codec(q, true, ImageCodec::ChromaSubsampling::CS_444, t);
            codec.process(input);
            const double bits = codec.getLastBitEstimate();
            EXPECT_GT(bits, prev) << "transform " << static_cast<int>(t) << " q" << q;
            prev = bits;
        }
    }
}

TEST(ImageCodecTest, UniformImageIsNearlyFree) {
    // A flat image quantizes to a constant per band, which has zero entropy.
    Image input(32, 32, 3);
    for (size_t i = 0; i < input.size(); ++i) input.data()[i] = 100.0;
    for (auto t : ALL_TRANSFORMS) {
        ImageCodec codec(50.0, true, ImageCodec::ChromaSubsampling::CS_444, t);
        codec.process(input);
        EXPECT_NEAR(codec.getLastBitEstimate(), 0.0, 1e-6);
    }
}

TEST(ImageCodecTest, Cdf97OutperformsHaarOnSmoothContent) {
    // Smooth gradients are where Haar's piecewise-constant basis struggles.
    Image input(64, 64, 3);
    for (int y = 0; y < 64; ++y)
        for (int x = 0; x < 64; ++x)
            for (int c = 0; c < 3; ++c)
                input.at(x, y, c) = 128.0 + 100.0 * std::sin(x * 0.15 + c) * std::cos(y * 0.1);

    ImageCodec haar(20.0, true, ImageCodec::ChromaSubsampling::CS_444, ImageCodec::TransformType::DWT_HAAR);
    ImageCodec cdf(20.0, true, ImageCodec::ChromaSubsampling::CS_444, ImageCodec::TransformType::DWT_97);
    const double psnrHaar = CodecAnalysis::computeMetrics(input, haar.process(input)).psnrY;
    const double psnrCdf = CodecAnalysis::computeMetrics(input, cdf.process(input)).psnrY;
    EXPECT_GT(psnrCdf, psnrHaar);
}

TEST(ImageCodecTest, SubbandMapOnlyForWavelets) {
    Image channel(40, 24, 1);
    for (int y = 0; y < 24; ++y)
        for (int x = 0; x < 40; ++x)
            channel.at(x, y, 0) = (x * 7 + y * 3) % 256;

    ImageCodec dct(50.0);
    EXPECT_TRUE(dct.subbandMap(channel).empty());

    ImageCodec cdf(50.0, true, ImageCodec::ChromaSubsampling::CS_444, ImageCodec::TransformType::DWT_97);
    Image map = cdf.subbandMap(channel);
    ASSERT_EQ(map.width(), 40);
    ASSERT_EQ(map.height(), 24);
    for (size_t i = 0; i < map.size(); ++i) {
        ASSERT_GE(map.data()[i], 0.0);
        ASSERT_LE(map.data()[i], 255.0);
    }
}

TEST(ImageCodecTest, ChromaUpsamplingIsSmooth) {
    // A horizontal chroma ramp should survive 4:2:2 without stair-steps:
    // bilinear upsampling keeps neighbouring output columns distinct.
    Image input(32, 8, 3);
    for (int y = 0; y < 8; ++y)
        for (int x = 0; x < 32; ++x) {
            input.at(x, y, 0) = 128.0;
            input.at(x, y, 1) = 128.0;
            input.at(x, y, 2) = 64.0 + 4.0 * x; // red ramp → Cr ramp
        }
    ImageCodec codec(100.0, false, ImageCodec::ChromaSubsampling::CS_422);
    Image output = codec.process(input);
    int flatPairs = 0;
    for (int x = 2; x < 30; x += 2)
        if (std::abs(output.at(x, 4, 2) - output.at(x + 1, 4, 2)) < 0.5) ++flatPairs;
    EXPECT_EQ(flatPairs, 0);
}

TEST(ImageCodecTest, InspectBlockPadsPartialEdgeBlocksByReplication) {
    // 12×10 channel: block (1, 1) covers x 8..11 and y 8..9 only.
    Image channel(12, 10, 1);
    for (int y = 0; y < 10; ++y)
        for (int x = 0; x < 12; ++x)
            channel.at(x, y, 0) = x * 10 + y;

    ImageCodec codec(50.0);
    auto debug = codec.inspectBlock(channel, 1, 1, false);

    for (int i = 0; i < 8; ++i)
        for (int j = 0; j < 8; ++j) {
            const int x = std::min(8 + j, 11);
            const int y = std::min(8 + i, 9);
            EXPECT_DOUBLE_EQ(debug.original[i][j], channel.at(x, y, 0)) << i << "," << j;
        }
}

TEST(ImageCodecTest, CoefficientStatsAreNormalisedAndTrackQuality) {
    Image noise = createNoiseImage(64, 48);
    Image luma(64, 48, 1);
    for (int y = 0; y < 48; ++y)
        for (int x = 0; x < 64; ++x)
            luma.at(x, y, 0) = noise.at(x, y, 0);

    for (auto t : ALL_TRANSFORMS) {
        ImageCodec low(10.0, true, ImageCodec::ChromaSubsampling::CS_444, t);
        ImageCodec high(90.0, true, ImageCodec::ChromaSubsampling::CS_444, t);
        const auto lo = low.coefficientStats(luma);
        const auto hi = high.coefficientStats(luma);

        double sum = 0.0;
        for (double h : lo.histogram) sum += h;
        EXPECT_NEAR(sum, 1.0, 1e-9) << "transform " << static_cast<int>(t);

        // Same transform → same histogram; coarser quantization zeroes more.
        for (int b = 0; b < ImageCodec::CoefficientStats::NUM_BINS; ++b)
            EXPECT_DOUBLE_EQ(lo.histogram[b], hi.histogram[b]);
        EXPECT_GT(lo.zeroFraction, hi.zeroFraction);
    }
}

TEST(ImageCodecTest, CoefficientStatsWithoutQuantizationCountOnlyExactZeros) {
    Image flat(16, 16, 1);
    for (size_t i = 0; i < flat.size(); ++i) flat.data()[i] = 77.0;
    ImageCodec codec(50.0, false);
    // A flat block has all-zero AC coefficients (up to rounding).
    EXPECT_GT(codec.coefficientStats(flat).histogram[0], 0.99);

    Image noise(16, 16, 1);
    unsigned st = 3u;
    for (size_t i = 0; i < noise.size(); ++i) { st = st * 1103515245u + 12345u; noise.data()[i] = (st >> 16) % 256; }
    EXPECT_LT(codec.coefficientStats(noise).zeroFraction, 0.05);
}
