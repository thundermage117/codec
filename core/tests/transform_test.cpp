#include <gtest/gtest.h>
#include "transform.h"
#include <cmath>
#include <cstring>
#include <algorithm>

TEST(TransformTest, ConstantBlock) {
    // If all pixels are 'A', then the DC coefficient (0,0) should be 8*A.
    // All other coefficients should be 0.
    // Note: This scaling factor depends on the normalization used.
    // The implementation uses: 1/4 * C(u) * C(v) * sum(...)
    // For u=0, v=0: C(0)=1/sqrt(2).
    // coeff(0,0) = 1/4 * 1/sqrt(2) * 1/sqrt(2) * sum(A)
    //            = 1/4 * 1/2 * (64 * A)
    //            = 1/8 * 64 * A = 8 * A.
    
    double src[8][8];
    double dst[8][8];
    double val = 10.0;
    
    for(int i=0; i<8; ++i)
        for(int j=0; j<8; ++j)
            src[i][j] = val;
            
    dct8x8(src, dst);
    
    EXPECT_NEAR(dst[0][0], 8.0 * val, 1e-5);
    
    for(int u=0; u<8; ++u) {
        for(int v=0; v<8; ++v) {
            if (u == 0 && v == 0) continue;
            EXPECT_NEAR(dst[u][v], 0.0, 1e-5) << "Non-zero AC coefficient at " << u << "," << v;
        }
    }
}

TEST(TransformTest, RoundTrip) {
    double src[8][8];
    double freq[8][8];
    double recovered[8][8];
    
    // Create a gradient block
    for(int i=0; i<8; ++i) {
        for(int j=0; j<8; ++j) {
            src[i][j] = static_cast<double>(i + j);
        }
    }
    
    dct8x8(src, freq);
    idct8x8(freq, recovered);
    
    for(int i=0; i<8; ++i) {
        for(int j=0; j<8; ++j) {
            EXPECT_NEAR(recovered[i][j], src[i][j], 1e-5)
                << "Mismatch at " << i << "," << j;
        }
    }
}

// Reference: the direct (non-separable) DCT-II definition the fast version
// must match exactly (up to floating-point rounding).
static void referenceDct(const double src[8][8], double dst[8][8]) {
    const double pi = 3.14159265358979323846;
    for (int u = 0; u < 8; ++u)
        for (int v = 0; v < 8; ++v) {
            double sum = 0.0;
            for (int x = 0; x < 8; ++x)
                for (int y = 0; y < 8; ++y)
                    sum += src[x][y] * std::cos((2 * x + 1) * u * pi / 16.0)
                                     * std::cos((2 * y + 1) * v * pi / 16.0);
            const double cu = u == 0 ? 1.0 / std::sqrt(2.0) : 1.0;
            const double cv = v == 0 ? 1.0 / std::sqrt(2.0) : 1.0;
            dst[u][v] = 0.25 * cu * cv * sum;
        }
}

TEST(TransformTest, MatchesDirectDefinition) {
    double src[8][8], fast[8][8], ref[8][8];
    unsigned state = 7u;
    for (int i = 0; i < 8; ++i)
        for (int j = 0; j < 8; ++j) {
            state = state * 1103515245u + 12345u;
            src[i][j] = static_cast<double>((state >> 16) % 256) - 128.0;
        }
    dct8x8(src, fast);
    referenceDct(src, ref);
    for (int u = 0; u < 8; ++u)
        for (int v = 0; v < 8; ++v)
            ASSERT_NEAR(fast[u][v], ref[u][v], 1e-9) << u << "," << v;
}

TEST(TransformTest, AsymmetricBlockKeepsOrientation) {
    // A horizontal ramp (varies along the column index y) must put its
    // energy in row u = 0, i.e. dst[0][v], not in column dst[u][0].
    double src[8][8], dst[8][8];
    for (int x = 0; x < 8; ++x)
        for (int y = 0; y < 8; ++y)
            src[x][y] = y * 10.0;
    dct8x8(src, dst);
    EXPECT_GT(std::abs(dst[0][1]), 1.0);
    EXPECT_NEAR(dst[1][0], 0.0, 1e-9);
}
