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
#include <vector>
#include <utility>

struct MotionVector {
    int dx;
    int dy;
    double mad;  // Mean Absolute Difference — match quality metric
};

class MotionEstimator {
public:
    // Load reference (previous) and current frames.
    // Internally extracts luma (Y) channel for matching.
    void loadFrames(const Image& reference, const Image& current);

    // Full exhaustive search over all candidate positions in search window.
    // blockSize: pixels per block side (8, 16, or 32)
    // searchRange: max displacement in each direction (e.g. 16)
    // Returns one MotionVector per block, in raster order (left-to-right, top-to-bottom).
    std::vector<MotionVector> fullSearch(int blockSize, int searchRange) const;

    // Three-step search — hierarchical, much faster than full search.
    std::vector<MotionVector> threeStepSearch(int blockSize, int searchRange) const;

    // Build residual frame: current minus the motion-compensated prediction.
    // Values are shifted to [0,255] for display (0 error → 128 grey).
    Image computeResidual(int blockSize, const std::vector<MotionVector>& mvs) const;

    // Returns the candidate (refX, refY) positions checked during full search
    // for a single block identified by its top-left position (bx, by) in the
    // current frame. Useful for step-by-step animation.
    std::vector<std::pair<int,int>> getSearchSteps(int bx, int by,
                                                   int blockSize,
                                                   int searchRange) const;

    int frameWidth()  const { return m_width; }
    int frameHeight() const { return m_height; }

private:
    Image m_refLuma;  // Y-channel of reference frame
    Image m_curLuma;  // Y-channel of current frame
    int m_width  = 0;
    int m_height = 0;

    // Extract single-channel luma image from an RGB/YCrCb image (channel 0).
    static Image extractLuma(const Image& src);

    // Mean Absolute Difference between a block in ref and a block in cur.
    // (refX, refY) — top-left of block in reference frame
    // (curX, curY) — top-left of block in current frame
    double computeMAD(int refX, int refY, int curX, int curY, int blockSize) const;
};
