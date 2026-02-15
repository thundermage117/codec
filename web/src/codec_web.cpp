#include <cstdint>
#include <cstdlib>
#include <algorithm>
#include <emscripten.h>
#include "ImageCodec.h"
#include "CodecAnalysis.h"
#include "Image.h"
#include "colorspace.h"

// A global session to hold the state between calls from JavaScript.
struct CodecSession {
    Image originalImage;
    Image processedYCrCb;
    CodecMetrics metrics;
    bool initialized = false;
};

static CodecSession g_session;

// Enum to match view modes in JavaScript.
enum ViewMode {
    RGB = 0,
    Artifacts = 1,
    Y = 2,
    Cr = 3,
    Cb = 4
};

extern "C" {

EMSCRIPTEN_KEEPALIVE
void init_session(uint8_t* input, int width, int height) {
    if (!input || width <= 0 || height <= 0) return;

    g_session.originalImage = Image(width, height, 3);
    double* imgData = g_session.originalImage.data();
    const size_t totalValues = static_cast<size_t>(width) * height * 3;

    for (size_t i = 0; i < totalValues; ++i) {
        imgData[i] = static_cast<double>(input[i]);
    }
    g_session.initialized = true;
}

EMSCRIPTEN_KEEPALIVE
void update_quality(int quality) {
    if (!g_session.initialized) return;

    ImageCodec codec(quality, true);
    Image processedBgr = codec.process(g_session.originalImage);
    g_session.metrics = CodecAnalysis::computeMetrics(g_session.originalImage, processedBgr);
    g_session.processedYCrCb = bgrToYCrCb(processedBgr);
}

EMSCRIPTEN_KEEPALIVE
uint8_t* get_view_ptr(int mode) {
    if (!g_session.initialized) return nullptr;

    const int width = g_session.originalImage.width();
    const int height = g_session.originalImage.height();
    const size_t numPixels = static_cast<size_t>(width) * height;
    const size_t totalValues = numPixels * 3;

    uint8_t* output = (uint8_t*)malloc(totalValues);
    if (!output) return nullptr;

    Image viewImage;

    switch (static_cast<ViewMode>(mode)) {
        case RGB:
            viewImage = ycrcbToBgr(g_session.processedYCrCb);
            break;
        case Artifacts:
            viewImage = g_session.metrics.artifactMap;
            break;
        case Y:
        case Cr:
        case Cb: {
            Image channel(width, height, 1);
            const double* ycrcbData = g_session.processedYCrCb.data();
            double* channelData = channel.data();
            int offset = (mode == Y) ? 0 : (mode == Cr ? 1 : 2);

            for (size_t i = 0; i < numPixels; ++i) {
                channelData[i] = ycrcbData[i * 3 + offset];
            }

            // Convert grayscale channel to 3-channel BGR for display
            Image bgrChannel(width, height, 3);
            double* bgrData = bgrChannel.data();
            for (size_t i = 0; i < numPixels; ++i) {
                bgrData[i * 3 + 0] = channelData[i];
                bgrData[i * 3 + 1] = channelData[i];
                bgrData[i * 3 + 2] = channelData[i];
            }
            viewImage = bgrChannel;
            break;
        }
    }

    const double* viewData = viewImage.data();
    for (size_t i = 0; i < totalValues; ++i) {
        output[i] = static_cast<uint8_t>(std::max(0.0, std::min(viewData[i], 255.0)));
    }

    return output;
}

EMSCRIPTEN_KEEPALIVE
double get_psnr_y() {
    return g_session.initialized ? g_session.metrics.psnrY : 0.0;
}

EMSCRIPTEN_KEEPALIVE
double get_psnr_cr() {
    return g_session.initialized ? g_session.metrics.psnrCr : 0.0;
}

EMSCRIPTEN_KEEPALIVE
double get_psnr_cb() {
    return g_session.initialized ? g_session.metrics.psnrCb : 0.0;
}

} // extern "C"