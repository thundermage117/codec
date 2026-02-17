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
