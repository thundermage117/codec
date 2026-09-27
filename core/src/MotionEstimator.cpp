/*
 * Codec Explorer: An interactive codec laboratory.
 * Copyright (C) 2026 Abhinav Tanniru
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */
#include "../inc/MotionEstimator.h"
#include <algorithm>
#include <climits>
#include <cmath>
#include <cstdlib>

// ---------------------------------------------------------------------------
// Luma extraction
// ---------------------------------------------------------------------------

static uint8_t toLuma(double r, double g, double b) {
    double y = 0.299 * r + 0.587 * g + 0.114 * b;
    return static_cast<uint8_t>(std::clamp(std::lround(y), 0L, 255L));
}

std::vector<uint8_t> MotionEstimator::extractLuma(const Image& src) {
    std::vector<uint8_t> luma;
    if (src.empty() || src.channels() < 1) return luma;

    const int w = src.width();
    const int h = src.height();
    luma.resize(static_cast<size_t>(w) * h);

    for (int y = 0; y < h; ++y) {
        for (int x = 0; x < w; ++x) {
            size_t i = static_cast<size_t>(y) * w + x;
            if (src.channels() >= 3) {
                luma[i] = toLuma(src.at(x, y, 0), src.at(x, y, 1), src.at(x, y, 2));
            } else {
                luma[i] = static_cast<uint8_t>(std::clamp(std::lround(src.at(x, y, 0)), 0L, 255L));
            }
        }
    }
    return luma;
}

std::vector<uint8_t> MotionEstimator::lumaFromRgba(const uint8_t* rgba, int width, int height) {
    std::vector<uint8_t> luma;
    if (!rgba || width <= 0 || height <= 0) return luma;

    const size_t n = static_cast<size_t>(width) * height;
    luma.resize(n);
    for (size_t i = 0; i < n; ++i)
        luma[i] = toLuma(rgba[i * 4 + 0], rgba[i * 4 + 1], rgba[i * 4 + 2]);
    return luma;
}

// ---------------------------------------------------------------------------
// Loading and validation
// ---------------------------------------------------------------------------

bool MotionEstimator::isValidBlockSize(int blockSize) {
    return blockSize == 4 || blockSize == 8 || blockSize == 16 || blockSize == 32;
}

bool MotionEstimator::isValidSearchRange(int range) {
    return range >= 1 && range <= 64;
}

bool MotionEstimator::loadFrames(const Image& reference, const Image& current) {
    if (reference.width() != current.width() || reference.height() != current.height())
        return false;
    return loadLuma(extractLuma(reference), extractLuma(current),
                    reference.width(), reference.height());
}

bool MotionEstimator::loadLuma(std::vector<uint8_t> reference, std::vector<uint8_t> current,
                               int width, int height) {
    const size_t n = static_cast<size_t>(width) * height;
    if (width <= 0 || height <= 0 || reference.size() != n || current.size() != n) {
        m_ref.clear();
        m_cur.clear();
        m_width = m_height = 0;
        return false;
    }
    m_ref = std::move(reference);
    m_cur = std::move(current);
    m_width = width;
    m_height = height;
    return true;
}

bool MotionEstimator::validParams(int blockSize, int searchRange) const {
    return isLoaded() && isValidBlockSize(blockSize) && isValidSearchRange(searchRange) &&
           blockSize <= m_width && blockSize <= m_height;
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

int MotionEstimator::blockSad(int curX, int curY, int dx, int dy, int blockSize, int limit) const {
    const int refX = curX + dx;
    const int refY = curY + dy;
    if (refX < 0 || refY < 0 || refX + blockSize > m_width || refY + blockSize > m_height)
        return -1;

    int sum = 0;
    for (int y = 0; y < blockSize; ++y) {
        const uint8_t* c = &m_cur[static_cast<size_t>(curY + y) * m_width + curX];
        const uint8_t* r = &m_ref[static_cast<size_t>(refY + y) * m_width + refX];
        for (int x = 0; x < blockSize; ++x)
            sum += std::abs(static_cast<int>(c[x]) - static_cast<int>(r[x]));
        if (sum > limit) return sum;  // cannot beat (or tie) the current best
    }
    return sum;
}

namespace {

// Tracks the best candidate for one block and which displacements have
// already been evaluated, so fast searches never pay for a point twice.
class BlockSearch {
public:
    BlockSearch(int range) : m_range(range), m_side(2 * range + 1),
        m_visited(static_cast<size_t>(m_side) * m_side, 0) {}

    bool inRange(int dx, int dy) const {
        return std::abs(dx) <= m_range && std::abs(dy) <= m_range;
    }

    bool visited(int dx, int dy) const { return m_visited[slot(dx, dy)] != 0; }
    void markVisited(int dx, int dy) { m_visited[slot(dx, dy)] = 1; }

    // Prefer lower SAD; break ties towards the shorter vector so flat or
    // repetitive areas settle on (0,0) instead of an arbitrary scan position.
    void offer(int dx, int dy, int sad) {
        if (sad < 0) return;
        const int len = dx * dx + dy * dy;
        if (!m_hasBest || sad < m_best.sad || (sad == m_best.sad && len < m_bestLen)) {
            m_best = {dx, dy, sad};
            m_bestLen = len;
            m_hasBest = true;
        }
    }

    bool hasBest() const { return m_hasBest; }
    const MotionVector& best() const { return m_best; }
    int limit() const { return m_hasBest ? m_best.sad : INT_MAX; }

private:
    size_t slot(int dx, int dy) const {
        return static_cast<size_t>(dy + m_range) * m_side + (dx + m_range);
    }

    int m_range;
    int m_side;
    std::vector<char> m_visited;
    MotionVector m_best{0, 0, 0};
    int m_bestLen = 0;
    bool m_hasBest = false;
};

}  // namespace

MotionVector MotionEstimator::searchBlock(SearchAlgorithm algorithm, int col, int row,
                                          int blockSize, int searchRange,
                                          long long& evaluated,
                                          std::vector<SearchCandidate>* trace) const {
    const int curX = col * blockSize;
    const int curY = row * blockSize;
    BlockSearch state(searchRange);

    // Evaluate one displacement (once). Returns its SAD, or -1 if it is out of
    // range/frame or was already visited.
    auto evaluate = [&](int dx, int dy, int iteration) -> int {
        if (!state.inRange(dx, dy) || state.visited(dx, dy)) return -1;
        state.markVisited(dx, dy);
        // Traced searches need exact SADs for every candidate (for display).
        const int limit = trace ? INT_MAX : state.limit();
        const int sad = blockSad(curX, curY, dx, dy, blockSize, limit);
        if (sad < 0) return -1;
        ++evaluated;
        if (trace) trace->push_back({dx, dy, sad, iteration});
        state.offer(dx, dy, sad);
        return sad;
    };

    // Every algorithm starts from the zero vector.
    evaluate(0, 0, 0);

    switch (algorithm) {
    case SearchAlgorithm::Full:
        for (int dy = -searchRange; dy <= searchRange; ++dy)
            for (int dx = -searchRange; dx <= searchRange; ++dx)
                evaluate(dx, dy, 1);
        break;

    case SearchAlgorithm::ThreeStep: {
        // Smallest power of two whose step sum (step + step/2 + ... + 1 =
        // 2*step - 1) reaches R, so every displacement is reachable.
        // R=7 -> 4,2,1; R=16 -> 16,8,4,2,1.
        int step = 1;
        while (step * 2 - 1 < searchRange) step *= 2;
        int iteration = 1;
        while (step >= 1) {
            const int cx = state.best().dx;
            const int cy = state.best().dy;
            for (int oy = -1; oy <= 1; ++oy)
                for (int ox = -1; ox <= 1; ++ox)
                    if (ox != 0 || oy != 0)
                        evaluate(cx + ox * step, cy + oy * step, iteration);
            step /= 2;
            ++iteration;
        }
        break;
    }

    case SearchAlgorithm::Diamond: {
        static const int LDSP[8][2] = {{0, -2}, {1, -1}, {2, 0}, {1, 1},
                                       {0, 2}, {-1, 1}, {-2, 0}, {-1, -1}};
        static const int SDSP[4][2] = {{0, -1}, {1, 0}, {0, 1}, {-1, 0}};
        // Each move strictly lowers the SAD, so this terminates; the cap is a
        // safety net well above the longest possible walk across the window.
        const int maxIterations = 4 * searchRange + 4;
        int iteration = 1;
        for (; iteration <= maxIterations; ++iteration) {
            const int cx = state.best().dx;
            const int cy = state.best().dy;
            for (const auto& o : LDSP) evaluate(cx + o[0], cy + o[1], iteration);
            if (state.best().dx == cx && state.best().dy == cy) break;
        }
        const int cx = state.best().dx;
        const int cy = state.best().dy;
        for (const auto& o : SDSP) evaluate(cx + o[0], cy + o[1], iteration + 1);
        break;
    }
    }

    // (0,0) is always inside the frame for a full block, so a best exists.
    return state.best();
}

SearchResult MotionEstimator::search(SearchAlgorithm algorithm, int blockSize,
                                     int searchRange) const {
    SearchResult result;
    if (!validParams(blockSize, searchRange)) return result;

    result.blockSize = blockSize;
    result.searchRange = searchRange;
    result.algorithm = algorithm;
    result.cols = m_width / blockSize;
    result.rows = m_height / blockSize;
    result.mvs.reserve(static_cast<size_t>(result.cols) * result.rows);

    for (int row = 0; row < result.rows; ++row)
        for (int col = 0; col < result.cols; ++col)
            result.mvs.push_back(searchBlock(algorithm, col, row, blockSize, searchRange,
                                             result.candidatesEvaluated, nullptr));
    return result;
}

std::vector<SearchCandidate> MotionEstimator::traceBlock(SearchAlgorithm algorithm, int col,
                                                         int row, int blockSize,
                                                         int searchRange) const {
    std::vector<SearchCandidate> trace;
    if (!validParams(blockSize, searchRange)) return trace;
    if (col < 0 || row < 0 || col >= m_width / blockSize || row >= m_height / blockSize)
        return trace;

    long long evaluated = 0;
    searchBlock(algorithm, col, row, blockSize, searchRange, evaluated, &trace);
    return trace;
}

std::vector<int> MotionEstimator::costSurface(int col, int row, int blockSize,
                                              int searchRange) const {
    std::vector<int> surface;
    if (!validParams(blockSize, searchRange)) return surface;
    if (col < 0 || row < 0 || col >= m_width / blockSize || row >= m_height / blockSize)
        return surface;

    const int side = 2 * searchRange + 1;
    surface.reserve(static_cast<size_t>(side) * side);
    for (int dy = -searchRange; dy <= searchRange; ++dy)
        for (int dx = -searchRange; dx <= searchRange; ++dx)
            surface.push_back(blockSad(col * blockSize, row * blockSize, dx, dy, blockSize, INT_MAX));
    return surface;
}

// ---------------------------------------------------------------------------
// Compensation
// ---------------------------------------------------------------------------

std::vector<uint8_t> MotionEstimator::predict(const std::vector<MotionVector>& mvs,
                                              int blockSize) const {
    std::vector<uint8_t> pred;
    if (!isLoaded() || !isValidBlockSize(blockSize)) return pred;

    const int cols = m_width / blockSize;
    const int rows = m_height / blockSize;
    if (mvs.size() != static_cast<size_t>(cols) * rows) return pred;

    // Start from the zero-motion prediction; this also covers the remainder
    // strips that are not part of any full block.
    pred = m_ref;

    for (int row = 0; row < rows; ++row) {
        for (int col = 0; col < cols; ++col) {
            const MotionVector& mv = mvs[static_cast<size_t>(row) * cols + col];
            const int curX = col * blockSize;
            const int curY = row * blockSize;
            const int refX = curX + mv.dx;
            const int refY = curY + mv.dy;
            if (refX < 0 || refY < 0 || refX + blockSize > m_width || refY + blockSize > m_height)
                continue;  // never produced by search(); keep zero-motion prediction
            for (int y = 0; y < blockSize; ++y) {
                const uint8_t* src = &m_ref[static_cast<size_t>(refY + y) * m_width + refX];
                uint8_t* dst = &pred[static_cast<size_t>(curY + y) * m_width + curX];
                std::copy(src, src + blockSize, dst);
            }
        }
    }
    return pred;
}

std::vector<int16_t> MotionEstimator::residual(const std::vector<MotionVector>& mvs,
                                               int blockSize) const {
    std::vector<int16_t> res;
    const std::vector<uint8_t> pred = predict(mvs, blockSize);
    if (pred.empty()) return res;

    res.resize(pred.size());
    for (size_t i = 0; i < pred.size(); ++i)
        res[i] = static_cast<int16_t>(static_cast<int>(m_cur[i]) - static_cast<int>(pred[i]));
    return res;
}
