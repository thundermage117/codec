#include "utils.h"

#include "Image.h"
#include <cmath> // For log10, pow

double computePSNR(const Image& I1, const Image& I2) {
    if (I1.width() != I2.width() || I1.height() != I2.height() || I1.channels() != I2.channels()) {
        return 0.0; // Or throw an exception
    }

    double mse = 0.0;
    const double* p1 = I1.data();
    const double* p2 = I2.data();
    const size_t totalSize = I1.size();

    for (size_t i = 0; i < totalSize; ++i) {
        double diff = p1[i] - p2[i];
        mse += diff * diff;
    }
    mse /= static_cast<double>(totalSize);

    if (mse <= 1e-10) return 100.0;

    return 10.0 * log10((255.0 * 255.0) / mse);
}