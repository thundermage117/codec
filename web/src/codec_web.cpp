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
    bool useTint = true;
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

static ImageCodec::ChromaSubsampling map_cs_mode(int mode) {
    switch (mode) {
        case 422: return ImageCodec::ChromaSubsampling::CS_422;
        case 420: return ImageCodec::ChromaSubsampling::CS_420;
        case 444:
        default:  return ImageCodec::ChromaSubsampling::CS_444;
    }
}

extern "C" {

EMSCRIPTEN_KEEPALIVE
void init_session(uint8_t* rgba_input, int width, int height) {
    if (!rgba_input || width <= 0 || height <= 0) return;

    g_session.originalImage = Image(width, height, 3);
    double* imgData = g_session.originalImage.data();
    const size_t numPixels = static_cast<size_t>(width) * height;

    // Convert RGBA from canvas to BGR for the codec
    for (size_t i = 0; i < numPixels; ++i) {
        imgData[i * 3 + 0] = static_cast<double>(rgba_input[i * 4 + 2]); // B
        imgData[i * 3 + 1] = static_cast<double>(rgba_input[i * 4 + 1]); // G
        imgData[i * 3 + 2] = static_cast<double>(rgba_input[i * 4 + 0]); // R
    }
    g_session.initialized = true;
}

EMSCRIPTEN_KEEPALIVE
void process_image(int quality, int cs_mode) {
    if (!g_session.initialized) return;

    auto cs = map_cs_mode(cs_mode);
    ImageCodec codec(quality, true, cs);
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
    const size_t totalRgbaValues = numPixels * 4;

    uint8_t* rgba_output = (uint8_t*)malloc(totalRgbaValues);
    if (!rgba_output) return nullptr;

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
                if (mode == Y) {
                    bgrData[i * 3 + 0] = channelData[i]; // B
                    bgrData[i * 3 + 1] = channelData[i]; // G
                    bgrData[i * 3 + 2] = channelData[i]; // R
                } else if (mode == Cr && g_session.useTint) {
                    bgrData[i * 3 + 0] = 128.0;          // B
                    bgrData[i * 3 + 1] = 128.0;          // G
                    bgrData[i * 3 + 2] = channelData[i]; // R (Tinted Red)
                } else if (mode == Cb && g_session.useTint) {
                    bgrData[i * 3 + 0] = channelData[i]; // B (Tinted Blue)
                    bgrData[i * 3 + 1] = 128.0;          // G
                    bgrData[i * 3 + 2] = 128.0;          // R
                } else {
                    // Grayscale for Cr/Cb if tint is disabled
                    bgrData[i * 3 + 0] = channelData[i];
                    bgrData[i * 3 + 1] = channelData[i];
                    bgrData[i * 3 + 2] = channelData[i];
                }
            }
            viewImage = bgrChannel;
            break;
        }
    }

    const double* viewData = viewImage.data();
    // Convert the 3-channel BGR viewImage to 4-channel RGBA for the canvas
    for (size_t i = 0; i < numPixels; ++i) {
        rgba_output[i * 4 + 0] = static_cast<uint8_t>(std::max(0.0, std::min(viewData[i * 3 + 2], 255.0))); // R
        rgba_output[i * 4 + 1] = static_cast<uint8_t>(std::max(0.0, std::min(viewData[i * 3 + 1], 255.0))); // G
        rgba_output[i * 4 + 2] = static_cast<uint8_t>(std::max(0.0, std::min(viewData[i * 3 + 0], 255.0))); // B
        rgba_output[i * 4 + 3] = 255; // Alpha
    }
    return rgba_output;
}

EMSCRIPTEN_KEEPALIVE
void set_view_tint(int enable) {
    g_session.useTint = (enable != 0);
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

EMSCRIPTEN_KEEPALIVE
double get_ssim_y() {
    return g_session.initialized ? g_session.metrics.ssimY : 0.0;
}

EMSCRIPTEN_KEEPALIVE
double get_ssim_cr() {
    return g_session.initialized ? g_session.metrics.ssimCr : 0.0;
}

EMSCRIPTEN_KEEPALIVE
double get_ssim_cb() {
    return g_session.initialized ? g_session.metrics.ssimCb : 0.0;
}


// Re-declaring to match the plan's arguments
EMSCRIPTEN_KEEPALIVE
double* inspect_block_data(int blockX, int blockY, int channelIndex, int quality) {
    if (!g_session.initialized) return nullptr;

    Image ycrcb = bgrToYCrCb(g_session.originalImage);
    Image channel(ycrcb.width(), ycrcb.height(), 1);
    const double* src = ycrcb.data();
    double* dst = channel.data();
    int offset = (channelIndex == 0) ? 0 : (channelIndex == 1 ? 1 : 2); // Y=0, Cr=1, Cb=2

    const size_t numPixels = static_cast<size_t>(ycrcb.width()) * ycrcb.height();
    for(size_t i=0; i < numPixels; ++i) {
        dst[i] = src[i*3 + offset];
    }

    bool isChroma = (channelIndex != 0);
    
    // Create temp codec
    // Note: CS mode doesn't affect the *inspection* of a single 8x8 block of the *source* image 
    // vis-a-vis the quantization tables. Subsampling logic happens before this in the pipeline typically,
    // but `inspectBlock` treats the input image as the plane to be blocked.
    // If we want to inspect the *subsampled* block, we would need to pass the subsampled image.
    // For simplicity, let's inspect the Full Resolution block using the appropriate Quant Table.
    ImageCodec codec(quality, true, ImageCodec::ChromaSubsampling::CS_444);
    
    static ImageCodec::BlockDebugData debugData; // Static to persist return pointer
    debugData = codec.inspectBlock(channel, blockX, blockY, isChroma);

    // Return pointer to the start of the struct (which is just a sequence of double[8][8])
    return (double*)&debugData;
}

} // extern "C"