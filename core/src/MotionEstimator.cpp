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
#include <cmath>
#include <algorithm>
#include <stdexcept>
#include <limits>

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

Image MotionEstimator::extractLuma(const Image& src) {
    // Expects an image with at least 1 channel.
    // If channels >= 3, treat as RGB and compute standard luma:
    //   Y = 0.299*R + 0.587*G + 0.114*B
    // If single-channel, just copy.
    if (src.empty())
        throw std::invalid_argument("MotionEstimator: cannot extract luma from empty image");

    Image luma(src.width(), src.height(), 1);

    if (src.channels() == 1) {
        for (int y = 0; y < src.height(); ++y)
            for (int x = 0; x < src.width(); ++x)
                luma.at(x, y, 0) = src.at(x, y, 0);
    } else {
        // channels >= 3: treat as R=0, G=1, B=2
        for (int y = 0; y < src.height(); ++y) {
            for (int x = 0; x < src.width(); ++x) {
                double r = src.at(x, y, 0);
                double g = src.at(x, y, 1);
                double b = src.at(x, y, 2);
                luma.at(x, y, 0) = 0.299 * r + 0.587 * g + 0.114 * b;
            }
        }
    }
    return luma;
}

double MotionEstimator::computeMAD(int refX, int refY,
                                   int curX, int curY,
                                   int blockSize) const {
    double sum = 0.0;
    for (int dy = 0; dy < blockSize; ++dy) {
        for (int dx = 0; dx < blockSize; ++dx) {
            double ref = m_refLuma.at(refX + dx, refY + dy, 0);
            double cur = m_curLuma.at(curX + dx, curY + dy, 0);
            sum += std::abs(ref - cur);
        }
    }
    return sum / static_cast<double>(blockSize * blockSize);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

void MotionEstimator::loadFrames(const Image& reference, const Image& current) {
    if (reference.width() != current.width() ||
        reference.height() != current.height())
        throw std::invalid_argument("MotionEstimator: frame dimensions must match");

    m_refLuma = extractLuma(reference);
    m_curLuma = extractLuma(current);
    m_width  = reference.width();
    m_height = reference.height();
}

std::vector<MotionVector> MotionEstimator::fullSearch(int blockSize,
                                                      int searchRange) const {
    if (m_refLuma.empty())
        throw std::runtime_error("MotionEstimator: frames not loaded");

    int cols = m_width  / blockSize;
    int rows = m_height / blockSize;

    std::vector<MotionVector> mvs;
    mvs.reserve(static_cast<size_t>(cols * rows));

    for (int row = 0; row < rows; ++row) {
        for (int col = 0; col < cols; ++col) {
            int curX = col * blockSize;
            int curY = row * blockSize;

            double bestMAD = std::numeric_limits<double>::max();
            int bestDx = 0, bestDy = 0;

            for (int dy = -searchRange; dy <= searchRange; ++dy) {
                for (int dx = -searchRange; dx <= searchRange; ++dx) {
                    int refX = curX + dx;
                    int refY = curY + dy;

                    // Skip candidate if it goes outside the reference frame
                    if (refX < 0 || refY < 0 ||
                        refX + blockSize > m_width ||
                        refY + blockSize > m_height)
                        continue;

                    double mad = computeMAD(refX, refY, curX, curY, blockSize);
                    if (mad < bestMAD) {
                        bestMAD = mad;
                        bestDx  = dx;
                        bestDy  = dy;
                    }
                }
            }

            mvs.push_back({bestDx, bestDy, bestMAD});
        }
    }

    return mvs;
}

std::vector<MotionVector> MotionEstimator::threeStepSearch(int blockSize,
                                                           int searchRange) const {
    if (m_refLuma.empty())
        throw std::runtime_error("MotionEstimator: frames not loaded");

    int cols = m_width  / blockSize;
    int rows = m_height / blockSize;

    std::vector<MotionVector> mvs;
    mvs.reserve(static_cast<size_t>(cols * rows));

    for (int row = 0; row < rows; ++row) {
        for (int col = 0; col < cols; ++col) {
            int curX = col * blockSize;
            int curY = row * blockSize;

            // Start at centre of search window
            int cx = curX, cy = curY;
            double bestMAD = computeMAD(cx, cy, curX, curY, blockSize);

            // Step size starts at half the search range, halves each iteration
            int step = searchRange / 2;
            if (step < 1) step = 1;

            while (step >= 1) {
                int newCx = cx, newCy = cy;

                // Check 8 neighbours at current step size + the current centre
                static const int offsets[9][2] = {
                    {-1,-1},{0,-1},{1,-1},
                    {-1, 0},{0, 0},{1, 0},
                    {-1, 1},{0, 1},{1, 1}
                };

                for (auto& off : offsets) {
                    int rx = cx + off[0] * step;
                    int ry = cy + off[1] * step;

                    if (rx < 0 || ry < 0 ||
                        rx + blockSize > m_width ||
                        ry + blockSize > m_height)
                        continue;

                    // Also clamp total displacement to searchRange
                    if (std::abs(rx - curX) > searchRange ||
                        std::abs(ry - curY) > searchRange)
                        continue;

                    double mad = computeMAD(rx, ry, curX, curY, blockSize);
                    if (mad < bestMAD) {
                        bestMAD = mad;
                        newCx   = rx;
                        newCy   = ry;
                    }
                }

                cx = newCx;
                cy = newCy;
                step /= 2;
            }

            mvs.push_back({cx - curX, cy - curY, bestMAD});
        }
    }

    return mvs;
}

Image MotionEstimator::computeResidual(int blockSize,
                                       const std::vector<MotionVector>& mvs) const {
    if (m_curLuma.empty())
        throw std::runtime_error("MotionEstimator: frames not loaded");

    int cols = m_width  / blockSize;
    int rows = m_height / blockSize;

    // Output is an RGB image (3 channels) so it can be written out as RGBA
    // later. We use 3 channels here and let the WASM layer add the alpha.
    Image residual(m_width, m_height, 1);

    for (int row = 0; row < rows; ++row) {
        for (int col = 0; col < cols; ++col) {
            const MotionVector& mv = mvs[static_cast<size_t>(row * cols + col)];
            int curX = col * blockSize;
            int curY = row * blockSize;
            int refX = curX + mv.dx;
            int refY = curY + mv.dy;

            for (int dy = 0; dy < blockSize; ++dy) {
                for (int dx = 0; dx < blockSize; ++dx) {
                    double cur = m_curLuma.at(curX + dx, curY + dy, 0);
                    double pred = 0.0;

                    int rx = refX + dx;
                    int ry = refY + dy;
                    if (rx >= 0 && ry >= 0 && rx < m_width && ry < m_height)
                        pred = m_refLuma.at(rx, ry, 0);

                    // Shift to [0,255]: 0 error → 128 (mid-grey)
                    double diff = (cur - pred) + 128.0;
                    diff = std::max(0.0, std::min(255.0, diff));
                    residual.at(curX + dx, curY + dy, 0) = diff;
                }
            }
        }
    }

    return residual;
}

std::vector<std::pair<int,int>> MotionEstimator::getSearchSteps(
    int bx, int by, int blockSize, int searchRange) const
{
    if (m_refLuma.empty())
        throw std::runtime_error("MotionEstimator: frames not loaded");

    std::vector<std::pair<int,int>> steps;
    steps.reserve(static_cast<size_t>((2 * searchRange + 1) * (2 * searchRange + 1)));

    for (int dy = -searchRange; dy <= searchRange; ++dy) {
        for (int dx = -searchRange; dx <= searchRange; ++dx) {
            int refX = bx + dx;
            int refY = by + dy;

            if (refX < 0 || refY < 0 ||
                refX + blockSize > m_width ||
                refY + blockSize > m_height)
                continue;

            steps.emplace_back(refX, refY);
        }
    }

    return steps;
}
