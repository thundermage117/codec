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
    double* inputImageData = inputImage.data();
    const size_t totalValues = static_cast<size_t>(width) * height * channels;
    for (size_t i = 0; i < totalValues; ++i) {
        inputImageData[i] = static_cast<double>(input[i]);
    }

    // Create codec
    ImageCodec codec(quality, true);

    // Process image
    Image outputImage = codec.process(inputImage);

    // Allocate output buffer for JS
    uint8_t* output =
        (uint8_t*)malloc(totalValues);

    const double* outputImageData = outputImage.data();
    for (size_t i = 0; i < totalValues; ++i) {
        // The ycrcbToBgr conversion already clamps to [0, 255]
        output[i] = static_cast<uint8_t>(outputImageData[i]);
    }

    return output;
}

}
