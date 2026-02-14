#pragma once
#include <vector>
#include <stdexcept>
#include <cstdint>

class Image {
public:
    Image() = default;

    Image(int width, int height, int channels)
        : m_width(width),
          m_height(height),
          m_channels(channels),
          m_data(width * height * channels, 0.0)
    {
        if (width <= 0 || height <= 0 || channels <= 0)
            throw std::invalid_argument("Invalid image dimensions");
    }

    // --- Basic Info ---
    int width() const { return m_width; }
    int height() const { return m_height; }
    int channels() const { return m_channels; }

    size_t size() const { return m_data.size(); }

    // --- Pixel Access (double precision) ---
    double& at(int x, int y, int c) {
        return m_data[index(x, y, c)];
    }

    const double& at(int x, int y, int c) const {
        return m_data[index(x, y, c)];
    }

    // --- Raw data pointer (useful for I/O or WASM) ---
    double* data() { return m_data.data(); }
    const double* data() const { return m_data.data(); }

private:
    int m_width  = 0;
    int m_height = 0;
    int m_channels = 0;

    std::vector<double> m_data;

    size_t index(int x, int y, int c) const {
        if (x < 0 || x >= m_width ||
            y < 0 || y >= m_height ||
            c < 0 || c >= m_channels)
        {
            throw std::out_of_range("Image index out of range");
        }

        return static_cast<size_t>(
            (y * m_width + x) * m_channels + c
        );
    }
};
