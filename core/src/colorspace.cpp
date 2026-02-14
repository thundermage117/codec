#include "colorspace.h"
#include <algorithm> // For std::min/max

Image bgrToYCrCb(const Image& input)
{
    Image output(input.width(), input.height(), 3);

    for (int y = 0; y < input.height(); ++y) {
        for (int x = 0; x < input.width(); ++x) {
            // Assuming BGR order from OpenCV
            double B = input.at(x, y, 0);
            double G = input.at(x, y, 1);
            double R = input.at(x, y, 2);

            double Y  =  0.299 * R + 0.587 * G + 0.114 * B;
            double Cr = (R - Y) * 0.713 + 128;
            double Cb = (B - Y) * 0.564 + 128;

            output.at(x, y, 0) = Y;
            output.at(x, y, 1) = Cr;
            output.at(x, y, 2) = Cb;
        }
    }
    return output;
}

Image ycrcbToBgr(const Image& input)
{
    Image output(input.width(), input.height(), 3);
    auto clamp = [](double val) { return std::max(0.0, std::min(255.0, val)); };

    for (int y = 0; y < input.height(); ++y) {
        for (int x = 0; x < input.width(); ++x) {
            double Y  = input.at(x, y, 0);
            double Cr = input.at(x, y, 1);
            double Cb = input.at(x, y, 2);

            double R = Y + 1.402 * (Cr - 128);
            double G = Y - 0.344136 * (Cb - 128) - 0.714136 * (Cr - 128);
            double B = Y + 1.772 * (Cb - 128);

            output.at(x, y, 0) = clamp(B);
            output.at(x, y, 1) = clamp(G);
            output.at(x, y, 2) = clamp(R);
        }
    }
    return output;
}