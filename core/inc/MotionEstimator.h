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
#pragma once
#include "Image.h"
#include <cstdint>
#include <vector>

/*
 * Block-matching motion estimation on 8-bit luma.
 *
 * Convention: a motion vector (dx, dy) for the block whose top-left corner is
 * (x, y) in the current frame means the block is predicted from the block at
 * (x + dx, y + dy) in the reference frame.
 *
 * Only full blocks are searched (cols = width / blockSize, rows likewise).
 * Pixels in the right/bottom remainder strips are predicted with a zero vector.
 */

enum class SearchAlgorithm {
    Full = 0,       // Exhaustive search of every candidate in the window
    ThreeStep = 1,  // Three-step search: 8 neighbours at halving step sizes
    Diamond = 2     // Diamond search: large diamond until centred, then small diamond
};

struct MotionVector {
    int dx;
    int dy;
    int sad;  // Sum of Absolute Differences of the chosen match
};

// One evaluated candidate, recorded in evaluation order by traceBlock().
struct SearchCandidate {
    int dx;
    int dy;
    int sad;
    int iteration;  // 0 = starting point; then search step / diamond iteration
};

struct SearchResult {
    std::vector<MotionVector> mvs;     // raster order, cols * rows entries
    long long candidatesEvaluated = 0; // unique SAD evaluations over all blocks
    int blockSize = 0;
    int searchRange = 0;
    int cols = 0;
    int rows = 0;
    SearchAlgorithm algorithm = SearchAlgorithm::Full;
};

class MotionEstimator {
public:
    static bool isValidBlockSize(int blockSize);  // 4, 8, 16 or 32
    static bool isValidSearchRange(int range);    // 1..64

    // ITU-R BT.601 luma, rounded to 8 bits. Accepts 1-channel (copied) or
    // >= 3-channel images interpreted as R, G, B.
    static std::vector<uint8_t> extractLuma(const Image& src);
    static std::vector<uint8_t> lumaFromRgba(const uint8_t* rgba, int width, int height);

    // Returns false (and leaves the estimator unloaded) if the frames are
    // empty or their dimensions differ.
    bool loadFrames(const Image& reference, const Image& current);
    bool loadLuma(std::vector<uint8_t> reference, std::vector<uint8_t> current,
                  int width, int height);

    bool isLoaded() const { return m_width > 0; }
    int frameWidth()  const { return m_width; }
    int frameHeight() const { return m_height; }
    const std::vector<uint8_t>& referenceLuma() const { return m_ref; }
    const std::vector<uint8_t>& currentLuma()   const { return m_cur; }

    // Estimate one vector per full block. Returns an empty result (no mvs)
    // if frames are not loaded or the parameters are invalid.
    SearchResult search(SearchAlgorithm algorithm, int blockSize, int searchRange) const;

    // Candidates evaluated for a single block (col, row), in evaluation order.
    std::vector<SearchCandidate> traceBlock(SearchAlgorithm algorithm, int col, int row,
                                            int blockSize, int searchRange) const;

    // SAD for every displacement in the window, row-major over
    // dy = -R..R, dx = -R..R ((2R+1)^2 entries). -1 marks candidates that
    // fall outside the reference frame.
    std::vector<int> costSurface(int col, int row, int blockSize, int searchRange) const;

    // Motion-compensated prediction of the current frame (8-bit luma).
    std::vector<uint8_t> predict(const std::vector<MotionVector>& mvs, int blockSize) const;

    // Signed residual: current - prediction, in [-255, 255].
    // Passing all-zero vectors gives the plain frame difference.
    std::vector<int16_t> residual(const std::vector<MotionVector>& mvs, int blockSize) const;

private:
    std::vector<uint8_t> m_ref;
    std::vector<uint8_t> m_cur;
    int m_width  = 0;
    int m_height = 0;

    bool validParams(int blockSize, int searchRange) const;

    // SAD between the current block at (curX, curY) and the reference block
    // displaced by (dx, dy). Returns -1 if the reference block leaves the
    // frame. Stops early and returns a value > limit once the partial sum
    // exceeds limit.
    int blockSad(int curX, int curY, int dx, int dy, int blockSize, int limit) const;

    MotionVector searchBlock(SearchAlgorithm algorithm, int col, int row, int blockSize,
                             int searchRange, long long& evaluated,
                             std::vector<SearchCandidate>* trace) const;
};
