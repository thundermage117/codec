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
#include "entropy.h"
#include <cmath>

EntropyEstimator::EntropyEstimator(int numBands)
    : m_histograms(numBands > 0 ? numBands : 1),
      m_counts(numBands > 0 ? numBands : 1, 0)
{
}

void EntropyEstimator::add(int band, double qIndex) {
    if (band < 0 || band >= static_cast<int>(m_counts.size())) return;
    ++m_histograms[band][std::llround(qIndex)];
    ++m_counts[band];
}

double EntropyEstimator::totalBits() const {
    double bits = 0.0;
    for (size_t b = 0; b < m_counts.size(); ++b) {
        const double n = static_cast<double>(m_counts[b]);
        if (n == 0.0) continue;
        // n·H = -Σ c·log2(c/n)
        for (const auto& entry : m_histograms[b]) {
            const double c = static_cast<double>(entry.second);
            bits -= c * std::log2(c / n);
        }
    }
    return bits;
}
