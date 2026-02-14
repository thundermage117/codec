#include "utils.h"

#include "Image.h"
#include <cmath> // For log10, pow

double computePSNR(const Image& I1, const Image& I2) {
    if (I1.width() != I2.width() || I1.height() != I2.height() || I1.channels() != I2.channels()) {
        return 0.0; // Or throw an exception
    }

    double mse = 0.0;
    for (int y = 0; y < I1.height(); ++y) {
        for (int x = 0; x < I1.width(); ++x) {
            for (int c = 0; c < I1.channels(); ++c) {
                mse += std::pow(I1.at(x, y, c) - I2.at(x, y, c), 2);
            }
        }
    }
    mse /= (I1.width() * I1.height() * I1.channels());

    if (mse <= 1e-10) return 100.0;

    return 10.0 * log10((255.0 * 255.0) / mse);
}