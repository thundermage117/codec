#ifndef IMAGE_H
#define IMAGE_H

#include <string>
#include <vector>

struct Image {
    int width;
    int height;
    int channels;
    std::vector<unsigned char> data;
};

Image loadImage(const std::string& path);

#endif
