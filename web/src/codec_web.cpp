#include <cstdint>
#include <cstdlib>
#include <algorithm>
#include <emscripten.h>
#include "ImageCodec.h"
#include "CodecAnalysis.h"
#include "Image.h"

// 1. Global variable to store the latest PSNR
static double g_last_psnr = 0.0;

extern "C" {

EMSCRIPTEN_KEEPALIVE
uint8_t* process_image(
    uint8_t* input,
    int width,
    int height,
    int channels,
    int quality
) {
    if (channels != 3 || input == nullptr || width <= 0 || height <= 0) {
        return nullptr;
    }

    const size_t totalPixels = static_cast<size_t>(width) * height;
    const size_t totalValues = totalPixels * 3;

    Image inputImage(width, height, 3);
    double* inputData = inputImage.data();

    for (size_t i = 0; i < totalValues; ++i) {
        inputData[i] = static_cast<double>(input[i]);
    }

    ImageCodec codec(quality, true);
    Image outputImage = codec.process(inputImage);

    // Calculate metrics
    CodecMetrics metrics = CodecAnalysis::computeMetrics(inputImage, outputImage);
    g_last_psnr = metrics.psnrY;

    uint8_t* output = (uint8_t*)malloc(totalValues);
    if (!output) return nullptr;

    const double* outData = outputImage.data();
    for (size_t i = 0; i < totalValues; ++i) {
        output[i] = static_cast<uint8_t>(std::max(0.0, std::min(outData[i], 255.0)));
    }

    return output;
}

// 3. New Helper Function for JS to call
EMSCRIPTEN_KEEPALIVE
double get_last_psnr() {
    return g_last_psnr;
}

} // extern "C"