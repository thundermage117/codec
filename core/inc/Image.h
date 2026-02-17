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
#include <vector>
#include <stdexcept>
#include <cstdint>
#include <algorithm> // For std::move

class Image {
public:
    // --- Constructors ---
    Image() = default;

    Image(int width, int height, int channels)
        : m_width(width),
          m_height(height),
          m_channels(channels)
    {
        if (width <= 0 || height <= 0 || channels <= 0)
            throw std::invalid_argument("Invalid image dimensions");
        
        m_data.resize(static_cast<size_t>(width) * height * channels, 0.0);
    }

    // --- Copy Semantics ---
    Image(const Image& other) = default;
    Image& operator=(const Image& other) = default;

    // --- Move Semantics (Crucial for performance in Version 1) ---
    // Instead of copying the data, we just transfer ownership of the vector.
    // This is extremely beneficial when returning large Image objects from functions.
    Image(Image&& other) noexcept 
        : m_width(other.m_width), 
          m_height(other.m_height), 
          m_channels(other.m_channels), 
          m_data(std::move(other.m_data)) 
    {
        other.m_width = 0;
        other.m_height = 0;
        other.m_channels = 0;
    }

    Image& operator=(Image&& other) noexcept {
        if (this != &other) {
            m_width = other.m_width;
            m_height = other.m_height;
            m_channels = other.m_channels;
            m_data = std::move(other.m_data);
            
            other.m_width = 0;
            other.m_height = 0;
            other.m_channels = 0;
        }
        return *this;
    }

    // --- Basic Info ---
    int width() const { return m_width; }
    int height() const { return m_height; }
    int channels() const { return m_channels; }
    size_t size() const { return m_data.size(); }
    bool empty() const { return m_data.empty(); }

    // --- Pixel Access ---
    // Note: Version 1 uses .at() in loops. For maximum speed, 
    // ensure your compiler inlines these calls.
    double& at(int x, int y, int c) {
        return m_data[index(x, y, c)];
    }

    const double& at(int x, int y, int c) const {
        return m_data[index(x, y, c)];
    }

    // --- Raw Data Access ---
    double* data() { return m_data.data(); }
    const double* data() const { return m_data.data(); }

private:
    int m_width  = 0;
    int m_height = 0;
    int m_channels = 0;
    std::vector<double> m_data;

    // Row-major interleaved indexing: (y * width + x) * channels + c
    inline size_t index(int x, int y, int c) const {
#ifdef DEBUG 
        // Optional: Only check bounds in Debug mode for performance
        if (x < 0 || x >= m_width || y < 0 || y >= m_height || c < 0 || c >= m_channels) {
            throw std::out_of_range("Image index out of range");
        }
#endif
        return static_cast<size_t>((y * m_width + x) * m_channels + c);
    }
};