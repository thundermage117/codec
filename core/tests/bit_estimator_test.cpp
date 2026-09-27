#include <gtest/gtest.h>
#include "BitEstimator.h"

#include <cmath>
#include <cstdint>
#include <vector>

namespace {

std::vector<int> texturePlane(int w, int h, int shiftX = 0) {
    std::vector<int> p(static_cast<size_t>(w) * h);
    for (int y = 0; y < h; ++y)
        for (int x = 0; x < w; ++x) {
            const int sx = x - shiftX;
            p[static_cast<size_t>(y) * w + x] =
                static_cast<int>(60 * std::sin(sx * 0.3) + 40 * std::cos(y * 0.23) + ((sx * 7 + y * 13) % 23));
        }
    return p;
}

}  // namespace

TEST(BitEstimatorTest, SignedExpGolombLengths) {
    EXPECT_EQ(BitEstimator::signedExpGolombBits(0), 1);
    EXPECT_EQ(BitEstimator::signedExpGolombBits(1), 3);
    EXPECT_EQ(BitEstimator::signedExpGolombBits(-1), 3);
    EXPECT_EQ(BitEstimator::signedExpGolombBits(2), 5);
    EXPECT_EQ(BitEstimator::signedExpGolombBits(-3), 5);
    EXPECT_EQ(BitEstimator::signedExpGolombBits(4), 7);
}

TEST(BitEstimatorTest, AllZeroBlockCostsOneBit) {
    int q[64] = {};
    EXPECT_EQ(BitEstimator::blockBits(q), 1);
}

TEST(BitEstimatorTest, BlockBitsFollowSymbolModel) {
    int q[64] = {};
    q[0] = 5;   // DC: 3 + size(5)=3 -> 6
    q[1] = -2;  // first zig-zag AC, run 0, size 2 -> 5 + 2 = 7
    // Remaining 62 zeros -> EOB 4
    EXPECT_EQ(BitEstimator::blockBits(q), 6 + 7 + 4);
}

TEST(BitEstimatorTest, ZeroPlaneIsAllSkips) {
    const int w = 32, h = 16;
    int skipped = -1;
    const double bits = BitEstimator::planeBits(std::vector<int>(w * h, 0), w, h, 50, &skipped);
    EXPECT_EQ(skipped, 8);
    EXPECT_DOUBLE_EQ(bits, 8.0);
}

TEST(BitEstimatorTest, HigherQualityCostsMoreBits) {
    const std::vector<int> plane = texturePlane(64, 64);
    EXPECT_GT(BitEstimator::planeBits(plane, 64, 64, 90), BitEstimator::planeBits(plane, 64, 64, 20));
}

TEST(BitEstimatorTest, MotionCompensatedResidualIsCheaperThanIntra) {
    const int w = 128, h = 128;
    MotionEstimator me;
    std::vector<uint8_t> ref(w * h), cur(w * h);
    const std::vector<int> a = texturePlane(w, h), b = texturePlane(w, h, 3);
    for (size_t i = 0; i < ref.size(); ++i) {
        ref[i] = static_cast<uint8_t>(std::clamp(a[i] + 128, 0, 255));
        cur[i] = static_cast<uint8_t>(std::clamp(b[i] + 128, 0, 255));
    }
    ASSERT_TRUE(me.loadLuma(ref, cur, w, h));
    SearchResult r = me.search(SearchAlgorithm::Full, 16, 8);

    std::vector<int> intra(cur.begin(), cur.end());
    for (int& v : intra) v -= 128;
    const std::vector<int16_t> res = me.residual(r.mvs, 16);
    const std::vector<int> residual(res.begin(), res.end());

    const double iBits = BitEstimator::planeBits(intra, w, h, 50);
    const double pBits = BitEstimator::planeBits(residual, w, h, 50) +
                         BitEstimator::motionVectorBits(r.mvs, r.cols, r.rows);
    EXPECT_LT(pBits * 3, iBits);
}

TEST(BitEstimatorTest, UniformVectorFieldIsNearlyFree) {
    // Every vector equals its median prediction except the first one.
    const int cols = 6, rows = 4;
    std::vector<MotionVector> mvs(cols * rows, MotionVector{-3, 2, 0});
    const double bits = BitEstimator::motionVectorBits(mvs, cols, rows);
    const double first = BitEstimator::signedExpGolombBits(-3) + BitEstimator::signedExpGolombBits(2);
    EXPECT_DOUBLE_EQ(bits, first + 2.0 * (cols * rows - 1));
}
