#include <cstdint>
#include <cstdlib>

#include "ImageCodec.h"
#include "Image.h"

extern "C" {

uint8_t* process_image(
    uint8_t* input,
    int width,
    int height,
    int channels,
    int quality
) {
    // Create Image from raw input
    Image inputImage(width, height, channels);

    for (int y = 0; y < height; ++y) {
        for (int x = 0; x < width; ++x) {
            for (int c = 0; c < channels; ++c) {
                inputImage.at(x, y, c) =
                    input[(y * width + x) * channels + c];
            }
        }
    }

    // Create codec
    ImageCodec codec(quality, true);

    // Process image
    Image outputImage = codec.process(inputImage);

    // Allocate output buffer for JS
    uint8_t* output =
        (uint8_t*)malloc(width * height * channels);

    for (int y = 0; y < height; ++y) {
        for (int x = 0; x < width; ++x) {
            for (int c = 0; c < channels; ++c) {
                output[(y * width + x) * channels + c] =
                    static_cast<uint8_t>(
                        outputImage.at(x, y, c)
                    );
            }
        }
    }

    return output;
}

}
