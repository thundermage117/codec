#include "processing.h"
#include "transform.h"
#include "utils.h"

#include <opencv2/opencv.hpp>

/*
* Processes the input grayscale image (CV_64F) by applying DCT and IDCT on 8x8 blocks.
 */
cv::Mat identityTransform(const cv::Mat& channel) {
    cv::Mat reconstructed = cv::Mat::zeros(channel.size(), CV_64F);

    for (int i = 0; i < channel.rows; i += 8) {
        for (int j = 0; j < channel.cols; j += 8) {

            // Ensure we don't go out of bounds for the last blocks
            if (i + 8 > channel.rows || j + 8 > channel.cols)
                continue;

            cv::Mat block = channel(cv::Rect(j, i, 8, 8)).clone();
            cv::Mat dctBlock = cv::Mat::zeros(8, 8, CV_64F);
            cv::Mat reconBlock = cv::Mat::zeros(8, 8, CV_64F);

            // Shift block values from [0, 255] to [-128, 127] for DCT
            // DCT works better with zero-centered data
            block -= 128.0;

            dct8x8(block, dctBlock);
            idct8x8(dctBlock, reconBlock);

            reconBlock += 128.0;

            reconBlock.copyTo(reconstructed(cv::Rect(j, i, 8, 8)));
        }
    }

    return reconstructed;
}

cv::Mat processColorImage(const cv::Mat& bgrImage, double& outPsnrY, double& outPsnrCb, double& outPsnrCr) {
    // Convert the image from BGR to YCrCb color space
    cv::Mat ycrcb_img;
    cv::cvtColor(bgrImage, ycrcb_img, cv::COLOR_BGR2YCrCb);
    ycrcb_img.convertTo(ycrcb_img, CV_64F);

    // Split the Y, Cr, and Cb channels
    std::vector<cv::Mat> ycrcb_channels;
    cv::split(ycrcb_img, ycrcb_channels);

    // Process each channel independently
    std::vector<cv::Mat> reconstructed_channels;
    reconstructed_channels.push_back(identityTransform(ycrcb_channels[0])); // Y
    reconstructed_channels.push_back(identityTransform(ycrcb_channels[1])); // Cr
    reconstructed_channels.push_back(identityTransform(ycrcb_channels[2])); // Cb

    // Merge the processed channels back into a single YCrCb image
    cv::Mat reconstructed_ycrcb;
    cv::merge(reconstructed_channels, reconstructed_ycrcb);

    // Calculate PSNR for each channel
    outPsnrY = computePSNR(ycrcb_channels[0], reconstructed_channels[0]);
    outPsnrCr = computePSNR(ycrcb_channels[1], reconstructed_channels[1]);
    outPsnrCb = computePSNR(ycrcb_channels[2], reconstructed_channels[2]);

    // Convert back to BGR for display
    cv::Mat reconstructed_bgr;
    reconstructed_ycrcb.convertTo(reconstructed_ycrcb, CV_8U);
    cv::cvtColor(reconstructed_ycrcb, reconstructed_bgr, cv::COLOR_YCrCb2BGR);

    return reconstructed_bgr;
}