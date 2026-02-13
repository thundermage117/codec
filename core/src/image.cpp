#define STB_IMAGE_IMPLEMENTATION
#include "stb_image.h"

#include "image.h"
#include <iostream>

Image loadImage(const std::string& path) {
    Image img;

    unsigned char* raw = stbi_load(
        path.c_str(),
        &img.width,
        &img.height,
        &img.channels,
        0
    );

    if (!raw) {
        std::cerr << "Failed to load image: " << path << std::endl;
        exit(1);
    }

    img.data.assign(raw, raw + (img.width * img.height * img.channels));
    stbi_image_free(raw);

    return img;
}
