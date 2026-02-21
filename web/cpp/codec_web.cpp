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
    Image originalYCrCb;
    Image processedYCrCb;
    // Reusable buffers for inspection to avoid reallocating 16MB+ per frame
    Image inspectionChannel;
    Image inspectionDS;
    CodecMetrics metrics;
    bool initialized = false;
    bool useTint = true;
};

static CodecSession g_session;
static double g_artifact_gain = 5.0;

// Enum to match view modes in JavaScript.
enum ViewMode {
    RGB = 0,
    Artifacts = 1,
    Y = 2,
    Cr = 3,
    Cb = 4,
    EdgeDistortion = 5,
    BlockingMap = 6
};

static ImageCodec::ChromaSubsampling map_cs_mode(int mode) {
    switch (mode) {
        case 422: return ImageCodec::ChromaSubsampling::CS_422;
        case 420: return ImageCodec::ChromaSubsampling::CS_420;
        case 444:
        default:  return ImageCodec::ChromaSubsampling::CS_444;
    }
}

static ImageCodec::TransformType map_transform_mode(int mode) {
    return (mode == 1) ? ImageCodec::TransformType::DWT : ImageCodec::TransformType::DCT;
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
    g_session.originalYCrCb = bgrToYCrCb(g_session.originalImage);
    g_session.initialized = true;
}

EMSCRIPTEN_KEEPALIVE
void process_image(int quality, int cs_mode, int transform_mode) {
    if (!g_session.initialized) return;

    auto cs = map_cs_mode(cs_mode);
    auto transform = map_transform_mode(transform_mode);
    ImageCodec codec(quality, true, cs, transform);
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
            viewImage = CodecAnalysis::computeArtifactMap(
                g_session.originalImage,
                ycrcbToBgr(g_session.processedYCrCb),
                g_artifact_gain
            );
            break;
        case EdgeDistortion:
            viewImage = CodecAnalysis::computeEdgeDistortionMap(g_session.originalImage, ycrcbToBgr(g_session.processedYCrCb));
            break;
        case BlockingMap:
            viewImage = CodecAnalysis::computeBlockingMap(ycrcbToBgr(g_session.processedYCrCb));
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
    const int viewCh = viewImage.channels();
    // Convert viewImage to 4-channel RGBA for the canvas.
    // EdgeDistortion and BlockingMap return 1-channel images; handle both cases.
    for (size_t i = 0; i < numPixels; ++i) {
        if (viewCh == 1) {
            uint8_t v = static_cast<uint8_t>(std::max(0.0, std::min(viewData[i], 255.0)));
            rgba_output[i * 4 + 0] = v; // R
            rgba_output[i * 4 + 1] = v; // G
            rgba_output[i * 4 + 2] = v; // B
        } else {
            rgba_output[i * 4 + 0] = static_cast<uint8_t>(std::max(0.0, std::min(viewData[i * 3 + 2], 255.0))); // R
            rgba_output[i * 4 + 1] = static_cast<uint8_t>(std::max(0.0, std::min(viewData[i * 3 + 1], 255.0))); // G
            rgba_output[i * 4 + 2] = static_cast<uint8_t>(std::max(0.0, std::min(viewData[i * 3 + 0], 255.0))); // B
        }
        rgba_output[i * 4 + 3] = 255; // Alpha
    }
    return rgba_output;
}

EMSCRIPTEN_KEEPALIVE
void set_view_tint(int enable) {
    g_session.useTint = (enable != 0);
}

EMSCRIPTEN_KEEPALIVE
void set_artifact_gain(double gain) {
    if (gain > 0.0) g_artifact_gain = gain;
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
// Helper to downsample a channel (simple averaging)
// Helper to downsample a channel (simple averaging)
void downsample_channel(const Image& src, Image& dst, ImageCodec::ChromaSubsampling cs) {
    if (cs == ImageCodec::ChromaSubsampling::CS_444) {
        // Just copy src to dst if 4:4:4 (shouldn't really happen with logic below, but safe fallback)
        dst = src; 
        return;
    }

    int w = src.width();
    int h = src.height();
    int scaleX = (cs == ImageCodec::ChromaSubsampling::CS_444) ? 1 : 2;
    int scaleY = (cs == ImageCodec::ChromaSubsampling::CS_420) ? 2 : 1;

    int newW = (w + scaleX - 1) / scaleX;
    int newH = (h + scaleY - 1) / scaleY;

    // Resize dst only if dimensions differ
    if (dst.width() != newW || dst.height() != newH || dst.channels() != 1) {
        dst = Image(newW, newH, 1);
    }
    
    // We can't easily reuse the internal vector without a resize method in Image that preserves capacity,
    // but assignment operator with new Image(w,h) will reallocate.
    // However, since we defined 'dst' in g_session, we want to avoid reallocation if possible.
    // The Image class in Image.h doesn't have a 'resize' method that keeps capacity.
    // Let's assume for now assignment is better than creating a LOCAL Image that dies immediately.
    // Ideally Image class should have a 'resize' or 'reshape'.
    // Use the naive assignment for now, it is still better than stack trashing if the compiler optimizes.
    // user: "Image class uses vector, so we could add a resize method?"
    // For now, let's just stick to the plan. Even member assignment avoids stack variable destroy/create overhead.
    
    for (int y = 0; y < newH; ++y) {
        for (int x = 0; x < newW; ++x) {
            double sum = 0.0;
            int count = 0;
            int startX = x * scaleX;
            int startY = y * scaleY;
            
            for (int dy = 0; dy < scaleY && (startY + dy) < h; ++dy) {
                for (int dx = 0; dx < scaleX && (startX + dx) < w; ++dx) {
                    sum += src.at(startX + dx, startY + dy, 0);
                    count++;
                }
            }
            dst.at(x, y, 0) = count > 0 ? sum / count : 0.0;
        }
    }
}

EMSCRIPTEN_KEEPALIVE
double* inspect_block_data(int blockX, int blockY, int channelIndex, int quality, int cs_mode, int transform_mode) {
    if (!g_session.initialized) return nullptr;

    // 1. Extract the specific channel from cached YCrCb
    const Image& ycrcb = g_session.originalYCrCb;
    
    // Reuse session buffer
    Image& channel = g_session.inspectionChannel;
    if (channel.width() != ycrcb.width() || channel.height() != ycrcb.height() || channel.channels() != 1) {
        channel = Image(ycrcb.width(), ycrcb.height(), 1);
    }

    const double* src = ycrcb.data();
    double* dst = channel.data();
    int offset = (channelIndex == 0) ? 0 : (channelIndex == 1 ? 1 : 2); // Y=0, Cr=1, Cb=2

    const size_t numPixels = static_cast<size_t>(ycrcb.width()) * ycrcb.height();
    
    // Optimization: Unroll or memcpy if possible? 
    // Strided copy, can't memcpy. But this simple loop is fast.
    for(size_t i=0; i < numPixels; ++i) {
        dst[i] = src[i*3 + offset];
    }

    bool isChroma = (channelIndex != 0);
    auto cs = map_cs_mode(cs_mode);
    
    // 2. Handle Chroma Subsampling
    // Pointer to the image we will actually inspect (either full res channel or downsampled)
    const Image* blockSourcePtr = &channel;
    int targetBx = blockX;
    int targetBy = blockY;

    if (isChroma && cs != ImageCodec::ChromaSubsampling::CS_444) {
        // Reuse session buffer for downsampling
        downsample_channel(channel, g_session.inspectionDS, cs);
        blockSourcePtr = &g_session.inspectionDS;
        
        // Map 8x8 block coords in original space to 8x8 block coords in downsampled space
        // 4:2:0 -> 2x2 original blocks = 1 chroma block
        int scaleX = 2; // 4:2:2 and 4:2:0 both halve width
        int scaleY = (cs == ImageCodec::ChromaSubsampling::CS_420) ? 2 : 1;
        
        targetBx = blockX / scaleX;
        targetBy = blockY / scaleY;
    }

    // 3. Inspect the block
    auto transform = map_transform_mode(transform_mode);
    ImageCodec codec(quality, true, cs, transform);
    static ImageCodec::BlockDebugData debugData;
    debugData = codec.inspectBlock(*blockSourcePtr, targetBx, targetBy, isChroma);

    return (double*)&debugData;
}

} // extern "C"