#include "ImageCodec.h"
#include "transform.h"
#include "utils.h"
#include <opencv2/opencv.hpp>

#include <cmath>

// Standard JPEG base quantization tables
static const int BASE_LUMA[8][8] = {
    {16,11,10,16,24,40,51,61},
    {12,12,14,19,26,58,60,55},
    {14,13,16,24,40,57,69,56},
    {14,17,22,29,51,87,80,62},
    {18,22,37,56,68,109,103,77},
    {24,35,55,64,81,104,113,92},
    {49,64,78,87,103,121,120,101},
    {72,92,95,98,112,100,103,99}
};

static const int BASE_CHROMA[8][8] = {
    {17,18,24,47,99,99,99,99},
    {18,21,26,66,99,99,99,99},
    {24,26,56,99,99,99,99,99},
    {47,66,99,99,99,99,99,99},
    {99,99,99,99,99,99,99,99},
    {99,99,99,99,99,99,99,99},
    {99,99,99,99,99,99,99,99},
    {99,99,99,99,99,99,99,99}
};

ImageCodec::ImageCodec(double quality, bool enableQuantization, bool useOpenCvDct)
    : m_quality(quality),
      m_enableQuantization(enableQuantization),
      m_useOpenCV_DCT(useOpenCvDct)
{
    if (m_enableQuantization)
        generateQuantizationTables();
}

/*
* Generates quantization tables based on the specified quality factor.
* The quality factor should be in the range [1, 100], where higher values mean better quality (less compression).
* The quantization tables are derived from the standard JPEG tables and scaled according to the quality factor.
*/
void ImageCodec::generateQuantizationTables()
{
    m_lumaQuantTable   = cv::Mat(8,8,CV_64F);
    m_chromaQuantTable = cv::Mat(8,8,CV_64F);

    // JPEG quality scaling formula
    double scale;
    if (m_quality < 50.0)
        scale = 5000.0 / m_quality;
    else
        scale = 200.0 - 2.0 * m_quality;

    scale /= 100.0;

    for (int i = 0; i < 8; ++i) {
        for (int j = 0; j < 8; ++j) {

            double lq = std::round(BASE_LUMA[i][j] * scale);
            double cq = std::round(BASE_CHROMA[i][j] * scale);

            m_lumaQuantTable.at<double>(i,j)   = std::max(1.0, lq);
            m_chromaQuantTable.at<double>(i,j) = std::max(1.0, cq);
        }
    }
}

/*
* Processes a single channel (Y, Cr, or Cb) by applying DCT, quantization, and inverse DCT.
* The input channel should be of type CV_64F and the quantization table should also be CV_64F.
* The output is the reconstructed channel after compression and decompression.
*/
cv::Mat ImageCodec::processChannel(const cv::Mat& channel,
                                   const cv::Mat& quantTable)
{
    cv::Mat reconstructed = cv::Mat::zeros(channel.size(), CV_64F);

    for (int i = 0; i < channel.rows; i += 8) {
        for (int j = 0; j < channel.cols; j += 8) {

            if (i + 8 > channel.rows || j + 8 > channel.cols)
                continue;

            cv::Mat block = channel(cv::Rect(j,i,8,8)).clone();
            cv::Mat dctBlock(8,8,CV_64F);
            cv::Mat reconBlock(8,8,CV_64F);

            block -= 128.0;

            if (m_useOpenCV_DCT) {
                cv::dct(block, dctBlock);
            } else {
                dct8x8(block, dctBlock);
            }

            if (m_enableQuantization) {
                for (int u = 0; u < 8; ++u) {
                    for (int v = 0; v < 8; ++v) {

                        double coeff = dctBlock.at<double>(u,v);
                        double q = quantTable.at<double>(u,v);

                        coeff = std::round(coeff / q);
                        dctBlock.at<double>(u,v) = coeff * q;
                    }
                }
            }

            if (m_useOpenCV_DCT) {
                cv::idct(dctBlock, reconBlock);
            } else {
                idct8x8(dctBlock, reconBlock);
            }

            reconBlock += 128.0;
            reconBlock.copyTo(reconstructed(cv::Rect(j,i,8,8)));
        }
    }

    return reconstructed;
}

/*
* Main processing function that takes a BGR image, converts it to YCrCb, processes each channel, and then converts it back to BGR.
*/
cv::Mat ImageCodec::process(const cv::Mat& bgrImage)
{
    cv::Mat ycrcb;
    cv::cvtColor(bgrImage, ycrcb, cv::COLOR_BGR2YCrCb);
    ycrcb.convertTo(ycrcb, CV_64F);

    std::vector<cv::Mat> channels;
    cv::split(ycrcb, channels);

    std::vector<cv::Mat> reconstructed(3);

    reconstructed[0] = processChannel(channels[0], m_lumaQuantTable);
    reconstructed[1] = processChannel(channels[1], m_chromaQuantTable);
    reconstructed[2] = processChannel(channels[2], m_chromaQuantTable);

    m_psnrY  = computePSNR(channels[0], reconstructed[0]);
    m_psnrCr = computePSNR(channels[1], reconstructed[1]);
    m_psnrCb = computePSNR(channels[2], reconstructed[2]);

    cv::Mat merged;
    cv::merge(reconstructed, merged);

    merged.convertTo(merged, CV_8U);

    cv::Mat output;
    cv::cvtColor(merged, output, cv::COLOR_YCrCb2BGR);

    return output;
}