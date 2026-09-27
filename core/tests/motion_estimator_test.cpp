#include <gtest/gtest.h>
#include "MotionEstimator.h"

#include <chrono>
#include <cstdint>
#include <cstdio>
#include <algorithm>
#include <climits>
#include <cmath>
#include <vector>

namespace {

// Deterministic, non-repeating texture so every block has a unique best match.
uint8_t texture(int x, int y) {
    uint32_t h = static_cast<uint32_t>(x) * 73856093u ^ static_cast<uint32_t>(y) * 19349663u;
    h ^= h >> 13;
    h *= 0x5bd1e995u;
    h ^= h >> 15;
    return static_cast<uint8_t>(h & 0xFF);
}

// Smooth texture (single basin in the SAD surface) so fast searches converge.
uint8_t smooth(int x, int y) {
    double v = 128.0 + 60.0 * std::sin(x * 0.07) + 50.0 * std::cos(y * 0.05) +
               10.0 * std::sin((x + y) * 0.11);
    return static_cast<uint8_t>(std::clamp(v, 0.0, 255.0));
}

std::vector<uint8_t> makeFrame(int w, int h, uint8_t (*fn)(int, int), int shiftX = 0, int shiftY = 0) {
    std::vector<uint8_t> f(static_cast<size_t>(w) * h);
    for (int y = 0; y < h; ++y)
        for (int x = 0; x < w; ++x)
            f[static_cast<size_t>(y) * w + x] = fn(x - shiftX, y - shiftY);
    return f;
}

// Content moved by (+sx, +sy) between reference and current, so the true
// vector (current -> reference) is (-sx, -sy).
MotionEstimator panned(int w, int h, int sx, int sy, uint8_t (*fn)(int, int)) {
    MotionEstimator me;
    EXPECT_TRUE(me.loadLuma(makeFrame(w, h, fn), makeFrame(w, h, fn, sx, sy), w, h));
    return me;
}

// Frames whose SAD surface for block (col, row) is separable, symmetric and
// convex with its only zero at (tx, ty): the current frame is flat and each
// reference pixel is offset by its L1 distance from the target block.
MotionEstimator unimodal(int w, int h, int bs, int col, int row, int tx, int ty) {
    const int x0 = col * bs + tx, x1 = x0 + bs - 1;
    const int y0 = row * bs + ty, y1 = y0 + bs - 1;
    std::vector<uint8_t> ref(static_cast<size_t>(w) * h), cur(static_cast<size_t>(w) * h, 40);
    for (int y = 0; y < h; ++y)
        for (int x = 0; x < w; ++x) {
            const int d = std::max({0, x0 - x, x - x1}) + std::max({0, y0 - y, y - y1});
            ref[static_cast<size_t>(y) * w + x] = static_cast<uint8_t>(std::min(255, 40 + d));
        }
    MotionEstimator me;
    EXPECT_TRUE(me.loadLuma(ref, cur, w, h));
    return me;
}

// Blocks far enough from the border that the true match lies inside the frame.
bool interiorBlock(const SearchResult& r, int col, int row, int margin) {
    const int x = col * r.blockSize;
    const int y = row * r.blockSize;
    return x >= margin && y >= margin &&
           x + r.blockSize + margin <= r.cols * r.blockSize &&
           y + r.blockSize + margin <= r.rows * r.blockSize;
}

const SearchAlgorithm kAll[] = {SearchAlgorithm::Full, SearchAlgorithm::ThreeStep,
                                SearchAlgorithm::Diamond};

}  // namespace

TEST(MotionEstimatorTest, LoadRejectsMismatchedOrEmptyFrames) {
    MotionEstimator me;
    EXPECT_FALSE(me.loadLuma(std::vector<uint8_t>(16), std::vector<uint8_t>(15), 4, 4));
    EXPECT_FALSE(me.isLoaded());
    EXPECT_FALSE(me.loadLuma({}, {}, 0, 0));
    EXPECT_FALSE(me.loadFrames(Image(4, 4, 3), Image(8, 4, 3)));
    EXPECT_TRUE(me.loadFrames(Image(8, 8, 3), Image(8, 8, 3)));
    EXPECT_TRUE(me.isLoaded());
}

TEST(MotionEstimatorTest, InvalidParametersReturnEmptyResult) {
    MotionEstimator me = panned(64, 64, 0, 0, texture);
    EXPECT_TRUE(me.search(SearchAlgorithm::Full, 0, 8).mvs.empty());
    EXPECT_TRUE(me.search(SearchAlgorithm::Full, 12, 8).mvs.empty());
    EXPECT_TRUE(me.search(SearchAlgorithm::Full, 8, 0).mvs.empty());
    EXPECT_TRUE(me.search(SearchAlgorithm::Full, 8, 65).mvs.empty());
    EXPECT_TRUE(me.traceBlock(SearchAlgorithm::Full, 99, 0, 8, 4).empty());
    EXPECT_TRUE(me.costSurface(-1, 0, 8, 4).empty());

    MotionEstimator unloaded;
    EXPECT_TRUE(unloaded.search(SearchAlgorithm::Full, 8, 4).mvs.empty());
    EXPECT_TRUE(unloaded.predict({}, 8).empty());
}

TEST(MotionEstimatorTest, ExtractLumaUsesBt601AndRounds) {
    Image img(2, 1, 3);
    img.at(0, 0, 0) = 255; img.at(0, 0, 1) = 0;   img.at(0, 0, 2) = 0;    // red
    img.at(1, 0, 0) = 100; img.at(1, 0, 1) = 100; img.at(1, 0, 2) = 100;  // grey
    std::vector<uint8_t> y = MotionEstimator::extractLuma(img);
    ASSERT_EQ(y.size(), 2u);
    EXPECT_EQ(y[0], 76);   // 0.299 * 255 = 76.2
    EXPECT_EQ(y[1], 100);

    const uint8_t rgba[8] = {255, 0, 0, 255, 100, 100, 100, 255};
    EXPECT_EQ(MotionEstimator::lumaFromRgba(rgba, 2, 1), y);
}

TEST(MotionEstimatorTest, IdenticalFramesGiveZeroVectorsAndZeroResidual) {
    MotionEstimator me = panned(64, 48, 0, 0, texture);
    for (SearchAlgorithm alg : kAll) {
        SearchResult r = me.search(alg, 8, 7);
        ASSERT_EQ(r.mvs.size(), 8u * 6u);
        for (const MotionVector& mv : r.mvs) {
            EXPECT_EQ(mv.dx, 0);
            EXPECT_EQ(mv.dy, 0);
            EXPECT_EQ(mv.sad, 0);
        }
        for (int16_t v : me.residual(r.mvs, 8)) EXPECT_EQ(v, 0);
    }
}

TEST(MotionEstimatorTest, FlatFrameTiesResolveToZeroVector) {
    // Every candidate has SAD 0 here; the old scan-order tie-break picked (-R,-R).
    MotionEstimator me;
    ASSERT_TRUE(me.loadLuma(std::vector<uint8_t>(64 * 64, 90), std::vector<uint8_t>(64 * 64, 90), 64, 64));
    for (SearchAlgorithm alg : kAll) {
        for (const MotionVector& mv : me.search(alg, 16, 8).mvs) {
            EXPECT_EQ(mv.dx, 0);
            EXPECT_EQ(mv.dy, 0);
        }
    }
}

TEST(MotionEstimatorTest, FullSearchRecoversIntegerPanExactly) {
    const int sx = 5, sy = -3;
    MotionEstimator me = panned(96, 96, sx, sy, texture);
    SearchResult r = me.search(SearchAlgorithm::Full, 16, 8);
    for (int row = 0; row < r.rows; ++row) {
        for (int col = 0; col < r.cols; ++col) {
            if (!interiorBlock(r, col, row, 8)) continue;
            const MotionVector& mv = r.mvs[static_cast<size_t>(row) * r.cols + col];
            EXPECT_EQ(mv.dx, -sx) << "block " << col << "," << row;
            EXPECT_EQ(mv.dy, -sy) << "block " << col << "," << row;
            EXPECT_EQ(mv.sad, 0);
        }
    }
}

TEST(MotionEstimatorTest, FastSearchesFindMinimumOfUnimodalSurface) {
    // Fast searches assume the SAD surface decreases towards the best match.
    // On such a surface they must find the global minimum, including targets
    // at the very edge of the window (old TSS started at step R/2, so for
    // R=7 it could only reach +-4).
    const int bs = 16, col = 3, row = 3;
    struct Case { int range, tx, ty; };
    const Case cases[] = {{4, -4, 4}, {7, 7, -7}, {7, 3, -5}, {16, -16, 16}, {16, 11, 6}, {16, -1, 0}};
    for (const Case& c : cases) {
        MotionEstimator me = unimodal(112, 112, bs, col, row, c.tx, c.ty);
        for (SearchAlgorithm alg : kAll) {
            std::vector<SearchCandidate> t = me.traceBlock(alg, col, row, bs, c.range);
            ASSERT_FALSE(t.empty());
            SearchResult r = me.search(alg, bs, c.range);
            const MotionVector& mv = r.mvs[static_cast<size_t>(row) * r.cols + col];
            EXPECT_EQ(mv.dx, c.tx) << "alg " << static_cast<int>(alg) << " R=" << c.range;
            EXPECT_EQ(mv.dy, c.ty) << "alg " << static_cast<int>(alg) << " R=" << c.range;
            EXPECT_EQ(mv.sad, 0);
        }
    }
}

TEST(MotionEstimatorTest, FastSearchesCanMissOnTexturedContent) {
    // Documents the tradeoff the UI teaches: on real texture the SAD surface
    // has local minima, so fast searches sometimes return a worse match than
    // full search, but never a better one.
    MotionEstimator me = panned(128, 128, -6, 4, smooth);
    SearchResult full = me.search(SearchAlgorithm::Full, 16, 8);
    for (SearchAlgorithm alg : {SearchAlgorithm::ThreeStep, SearchAlgorithm::Diamond}) {
        SearchResult fast = me.search(alg, 16, 8);
        ASSERT_EQ(fast.mvs.size(), full.mvs.size());
        for (size_t i = 0; i < full.mvs.size(); ++i)
            EXPECT_GE(fast.mvs[i].sad, full.mvs[i].sad);
    }
}

TEST(MotionEstimatorTest, FullSearchEvaluatesEveryInFrameCandidateOnce) {
    MotionEstimator me = panned(64, 64, 0, 0, texture);
    const int range = 4;
    // Interior block: whole (2R+1)^2 window fits.
    std::vector<SearchCandidate> t = me.traceBlock(SearchAlgorithm::Full, 1, 1, 16, range);
    EXPECT_EQ(t.size(), 81u);
    EXPECT_EQ(t.front().dx, 0);
    EXPECT_EQ(t.front().dy, 0);
    EXPECT_EQ(t.front().iteration, 0);
    // Corner block: only dx, dy in [0, R] fit.
    EXPECT_EQ(me.traceBlock(SearchAlgorithm::Full, 0, 0, 16, range).size(), 25u);
}

TEST(MotionEstimatorTest, FastSearchesEvaluateFarFewerCandidates) {
    MotionEstimator me = panned(128, 128, 3, 2, smooth);
    const long long full = me.search(SearchAlgorithm::Full, 16, 16).candidatesEvaluated;
    const long long tss = me.search(SearchAlgorithm::ThreeStep, 16, 16).candidatesEvaluated;
    const long long ds = me.search(SearchAlgorithm::Diamond, 16, 16).candidatesEvaluated;
    EXPECT_GT(full, 0);
    EXPECT_LT(tss * 10, full);
    EXPECT_LT(ds * 10, full);
}

TEST(MotionEstimatorTest, TraceMatchesSearchResultAndHasNoDuplicates) {
    MotionEstimator me = panned(128, 128, -3, 5, smooth);
    for (SearchAlgorithm alg : kAll) {
        SearchResult r = me.search(alg, 16, 8);
        const int col = 3, row = 4;
        std::vector<SearchCandidate> t = me.traceBlock(alg, col, row, 16, 8);
        ASSERT_FALSE(t.empty());
        const MotionVector& mv = r.mvs[static_cast<size_t>(row) * r.cols + col];
        int bestSad = INT_MAX;
        for (size_t i = 0; i < t.size(); ++i) {
            bestSad = std::min(bestSad, t[i].sad);
            for (size_t j = i + 1; j < t.size(); ++j)
                EXPECT_FALSE(t[i].dx == t[j].dx && t[i].dy == t[j].dy);
        }
        EXPECT_EQ(bestSad, mv.sad);
    }
}

TEST(MotionEstimatorTest, CostSurfaceMinimumMatchesFullSearch) {
    MotionEstimator me = panned(96, 96, 2, -4, texture);
    const int range = 6;
    SearchResult r = me.search(SearchAlgorithm::Full, 16, range);
    const int col = 2, row = 2;
    std::vector<int> s = me.costSurface(col, row, 16, range);
    const int side = 2 * range + 1;
    ASSERT_EQ(s.size(), static_cast<size_t>(side * side));
    const MotionVector& mv = r.mvs[static_cast<size_t>(row) * r.cols + col];
    const int at = s[static_cast<size_t>(mv.dy + range) * side + (mv.dx + range)];
    EXPECT_EQ(at, mv.sad);
    for (int v : s) if (v >= 0) EXPECT_GE(v, mv.sad);
    // Corner block: displacements that leave the frame are marked -1.
    EXPECT_EQ(me.costSurface(0, 0, 16, range)[0], -1);
}

TEST(MotionEstimatorTest, RemainderStripsUseZeroMotionPrediction) {
    // 70x50 with 16px blocks leaves a 6px strip on the right and 2px at the bottom.
    const int w = 70, h = 50;
    MotionEstimator me;
    std::vector<uint8_t> ref = makeFrame(w, h, texture);
    std::vector<uint8_t> cur = makeFrame(w, h, texture, 1, 0);
    ASSERT_TRUE(me.loadLuma(ref, cur, w, h));
    SearchResult r = me.search(SearchAlgorithm::Full, 16, 4);
    ASSERT_EQ(r.cols, 4);
    ASSERT_EQ(r.rows, 3);
    std::vector<uint8_t> pred = me.predict(r.mvs, 16);
    std::vector<int16_t> res = me.residual(r.mvs, 16);
    ASSERT_EQ(pred.size(), static_cast<size_t>(w * h));
    for (int y = 0; y < h; ++y) {
        for (int x = 0; x < w; ++x) {
            if (x < 64 && y < 48) continue;
            const size_t i = static_cast<size_t>(y) * w + x;
            EXPECT_EQ(pred[i], ref[i]);
            EXPECT_EQ(res[i], static_cast<int>(cur[i]) - static_cast<int>(ref[i]));
        }
    }
}

TEST(MotionEstimatorTest, MotionCompensationShrinksResidualVersusFrameDifference) {
    MotionEstimator me = panned(128, 128, 4, 3, texture);
    SearchResult r = me.search(SearchAlgorithm::Full, 16, 8);
    std::vector<MotionVector> zero(r.mvs.size(), MotionVector{0, 0, 0});
    long long withMc = 0, withoutMc = 0;
    for (int16_t v : me.residual(r.mvs, 16)) withMc += std::abs(v);
    for (int16_t v : me.residual(zero, 16)) withoutMc += std::abs(v);
    EXPECT_LT(withMc * 4, withoutMc);
}

TEST(MotionEstimatorTest, BenchmarkFullSearch) {
    // Not an assertion: prints timings for the default web image size.
    const int w = 768, h = 512;
    MotionEstimator me = panned(w, h, 3, 2, texture);
    for (int range : {16, 32}) {
        auto t0 = std::chrono::steady_clock::now();
        SearchResult r = me.search(SearchAlgorithm::Full, 16, range);
        auto ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
        std::printf("[bench] full search 768x512 bs16 R%d: %.1f ms (%lld candidates)\n",
                    range, ms, r.candidatesEvaluated);
    }
}
