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
#ifndef ENTROPY_H
#define ENTROPY_H

#include <unordered_map>
#include <vector>

/*
 * Estimates the coded size of a set of quantization indices as their
 * zeroth-order (Shannon) entropy, measured separately per subband.
 *
 * Grouping by subband — one band per DCT frequency position, or per wavelet
 * subband — models what a context-adaptive entropy coder exploits: a band that
 * quantizes to all zeros costs ~0 bits, while busy bands cost more. Using the
 * same model for every transform keeps their bit estimates comparable.
 */
class EntropyEstimator {
public:
    explicit EntropyEstimator(int numBands);

    void add(int band, double qIndex);

    // Sum over bands of count_b × H_b, in bits.
    double totalBits() const;

private:
    std::vector<std::unordered_map<long long, long long>> m_histograms;
    std::vector<long long> m_counts;
};

#endif // ENTROPY_H
