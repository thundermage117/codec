#ifndef IMAGE_PROCESSOR_H
#define IMAGE_PROCESSOR_H

#include <opencv2/opencv.hpp>

/*
* ImageCodec class encapsulates the functionality for compressing and decompressing images using DCT and quantization.
* It allows for adjustable quality settings and can use either OpenCV's built-in DCT functions or custom implementations.
*/
class ImageCodec {
public:
    /*
    * Constructs an ImageCodec with the specified quality, quantization, and DCT options.
    * @param quality Quality factor for quantization (1-100). Higher means better quality.
    * @param enableQuantization Whether to apply quantization to DCT coefficients.
    * @param useOpenCvDct Whether to use OpenCV's built-in DCT functions or custom implementations.
    */
    explicit ImageCodec(double quality, 
                        bool enableQuantization = true, 
                        bool useOpenCvDct = true);

    
    cv::Mat process(const cv::Mat& bgrImage);

    double getPSNRY()  const { return m_psnrY; }
    double getPSNRCb() const { return m_psnrCb; }
    double getPSNRCr() const { return m_psnrCr; }

private:
    double m_quality;
    bool   m_enableQuantization;
    bool   m_useOpenCV_DCT;


    cv::Mat m_lumaQuantTable;
    cv::Mat m_chromaQuantTable;

    double m_psnrY = 0.0;
    double m_psnrCb = 0.0;
    double m_psnrCr = 0.0;

    void generateQuantizationTables();
    cv::Mat processChannel(const cv::Mat& channel,
                           const cv::Mat& quantTable);
};


#endif
