#include <gtest/gtest.h>
#include "wavelet.h"
#include <cmath>

// For a constant block of value A, the 3-level 2D Haar DWT concentrates all
// energy into dst[0][0] = 8*A, with all other coefficients zero.
// (Same DC scaling as the DCT for consistency.)
TEST(WaveletTest, ConstantBlock) {
    double src[8][8];
    double dst[8][8];
    const double val = 10.0;

    for (int i = 0; i < 8; ++i)
        for (int j = 0; j < 8; ++j)
            src[i][j] = val;

    dwt8x8(src, dst);

    EXPECT_NEAR(dst[0][0], 8.0 * val, 1e-9);

    for (int i = 0; i < 8; ++i) {
        for (int j = 0; j < 8; ++j) {
            if (i == 0 && j == 0) continue;
            EXPECT_NEAR(dst[i][j], 0.0, 1e-9)
                << "Non-zero detail coefficient at " << i << "," << j;
        }
    }
}

// Perfect reconstruction: dwt8x8 followed by idwt8x8 must recover the
// original block within floating-point rounding tolerance.
TEST(WaveletTest, RoundTrip) {
    double src[8][8];
    double coeffs[8][8];
    double recovered[8][8];

    // Gradient block
    for (int i = 0; i < 8; ++i)
        for (int j = 0; j < 8; ++j)
            src[i][j] = static_cast<double>(i + j);

    dwt8x8(src, coeffs);
    idwt8x8(coeffs, recovered);

    for (int i = 0; i < 8; ++i) {
        for (int j = 0; j < 8; ++j) {
            EXPECT_NEAR(recovered[i][j], src[i][j], 1e-9)
                << "Mismatch at " << i << "," << j;
        }
    }
}

// Energy conservation: the orthonormal Haar DWT is an isometry, so the
// Frobenius norm of the coefficient matrix must equal that of the input.
TEST(WaveletTest, EnergyConservation) {
    double src[8][8];
    double dst[8][8];

    for (int i = 0; i < 8; ++i)
        for (int j = 0; j < 8; ++j)
            src[i][j] = static_cast<double>((i * 3 + j * 5 + 7) % 256) - 128.0;

    dwt8x8(src, dst);

    double energySrc = 0.0, energyDst = 0.0;
    for (int i = 0; i < 8; ++i)
        for (int j = 0; j < 8; ++j) {
            energySrc += src[i][j] * src[i][j];
            energyDst += dst[i][j] * dst[i][j];
        }

    EXPECT_NEAR(energySrc, energyDst, 1e-6);
}

// Round-trip with a random-ish block to verify reconstruction on non-trivial data.
TEST(WaveletTest, RoundTripMixed) {
    double src[8][8];
    double coeffs[8][8];
    double recovered[8][8];

    for (int i = 0; i < 8; ++i)
        for (int j = 0; j < 8; ++j)
            src[i][j] = static_cast<double>((i * 17 + j * 31 + 13) % 256);

    dwt8x8(src, coeffs);
    idwt8x8(coeffs, recovered);

    for (int i = 0; i < 8; ++i) {
        for (int j = 0; j < 8; ++j) {
            EXPECT_NEAR(recovered[i][j], src[i][j], 1e-9)
                << "Mismatch at " << i << "," << j;
        }
    }
}
