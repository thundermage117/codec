#include "colorspace.h"
#include <algorithm> // For std::min/max

Image bgrToYCrCb(const Image& input)
{
    Image output(input.width(), input.height(), 3);
    const double* pIn = input.data();
    double* pOut = output.data();
    const size_t numPixels = static_cast<size_t>(input.width()) * input.height();

    for (size_t i = 0; i < numPixels; ++i) {
        // BGR order
        const double B = *pIn++;
        const double G = *pIn++;
        const double R = *pIn++;

        double Y  =  0.299 * R + 0.587 * G + 0.114 * B;
        double Cr = (R - Y) * 0.713 + 128;
        double Cb = (B - Y) * 0.564 + 128;

        *pOut++ = Y;
        *pOut++ = Cr;
        *pOut++ = Cb;
    }
    return output;
}

Image ycrcbToBgr(const Image& input)
{
    Image output(input.width(), input.height(), 3);
    auto clamp = [](double val) { return std::max(0.0, std::min(255.0, val)); };
    const double* pIn = input.data();
    double* pOut = output.data();
    const size_t numPixels = static_cast<size_t>(input.width()) * input.height();

    for (size_t i = 0; i < numPixels; ++i) {
        const double Y  = *pIn++;
        const double Cr = *pIn++;
        const double Cb = *pIn++;

        double R = Y + 1.402 * (Cr - 128);
        double G = Y - 0.344136 * (Cb - 128) - 0.714136 * (Cr - 128);
        double B = Y + 1.772 * (Cb - 128);

        *pOut++ = clamp(B);
        *pOut++ = clamp(G);
        *pOut++ = clamp(R);
    }
    return output;
}