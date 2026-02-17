#include <gtest/gtest.h>
#include "Image.h"

TEST(ImageTest, DefaultConstructor) {
    Image img;
    EXPECT_EQ(img.width(), 0);
    EXPECT_EQ(img.height(), 0);
    EXPECT_EQ(img.channels(), 0);
    EXPECT_TRUE(img.empty());
    EXPECT_EQ(img.size(), 0);
}

TEST(ImageTest, ParameterizedConstructor) {
    Image img(10, 20, 3);
    EXPECT_EQ(img.width(), 10);
    EXPECT_EQ(img.height(), 20);
    EXPECT_EQ(img.channels(), 3);
    EXPECT_FALSE(img.empty());
    EXPECT_EQ(img.size(), 10 * 20 * 3);
}

TEST(ImageTest, InvalidDimensions) {
    EXPECT_THROW(Image(0, 10, 3), std::invalid_argument);
    EXPECT_THROW(Image(10, -1, 3), std::invalid_argument);
    EXPECT_THROW(Image(10, 10, 0), std::invalid_argument);
}

TEST(ImageTest, PixelAccess) {
    Image img(2, 2, 1);
    img.at(0, 0, 0) = 1.0;
    img.at(1, 0, 0) = 2.0;
    img.at(0, 1, 0) = 3.0;
    img.at(1, 1, 0) = 4.0;

    EXPECT_DOUBLE_EQ(img.at(0, 0, 0), 1.0);
    EXPECT_DOUBLE_EQ(img.at(1, 0, 0), 2.0);
    EXPECT_DOUBLE_EQ(img.at(0, 1, 0), 3.0);
    EXPECT_DOUBLE_EQ(img.at(1, 1, 0), 4.0);
}

// Check bounds checking only if DEBUG is defined, or if we want to enforce it.
// The current implementation in Image.h has #ifdef DEBUG.
// We can try to trigger it if we can enable DEBUG, but for now let's skip standard bounds check
// unless we are sure it is compiled in. 
// However, looking at the code, it throws std::out_of_range.

TEST(ImageTest, CopyConstructor) {
    Image img1(10, 10, 3);
    img1.at(5, 5, 1) = 42.0;
    
    Image img2 = img1;
    EXPECT_EQ(img2.width(), 10);
    EXPECT_EQ(img2.height(), 10);
    EXPECT_EQ(img2.channels(), 3);
    EXPECT_DOUBLE_EQ(img2.at(5, 5, 1), 42.0);
    
    // Ensure deep copy
    img2.at(5, 5, 1) = 100.0;
    EXPECT_DOUBLE_EQ(img1.at(5, 5, 1), 42.0);
}

TEST(ImageTest, MoveConstructor) {
    Image img1(10, 10, 3);
    img1.at(5, 5, 1) = 42.0;
    
    Image img2 = std::move(img1);
    EXPECT_EQ(img2.width(), 10);
    EXPECT_EQ(img2.height(), 10);
    EXPECT_EQ(img2.channels(), 3);
    EXPECT_DOUBLE_EQ(img2.at(5, 5, 1), 42.0);
    
    // Check if source is empty (implementation sets to 0)
    EXPECT_EQ(img1.width(), 0);
    EXPECT_EQ(img1.height(), 0);
    EXPECT_EQ(img1.channels(), 0);
    EXPECT_TRUE(img1.empty());
}
