/*
 * Codec Explorer: An interactive codec laboratory.
 * Copyright (C) 2026 Abhinav Tanniru
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */
#include <iostream>
#include <opencv2/opencv.hpp>
#include <iomanip>
#include <vector>
#include <string>
#include "ImageCodec.h"
#include "CodecAnalysis.h"
#include "CvAdapter.h"
#include "colorspace.h"
#include "CodecExplorerApp.h"

int main(int argc, char** argv) {
    std::cout << "Codec Explorer  Copyright (C) 2026  Abhinav Tanniru\n"
                 "This program comes with ABSOLUTELY NO WARRANTY; for details type `show w'.\n"
                 "This is free software, and you are welcome to redistribute it\n"
                 "under certain conditions; type `show c' for details.\n"
              << std::endl;

    // --- Argument Parsing ---
    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "help" || arg == "--help" || arg == "-h") {
            std::cout << "Usage:\n"
                      << "  " << argv[0] << " [path_to_image] [--cs <mode>]\n\n"
                      << "An interactive codec laboratory to visualize image compression.\n\n"
                      << "Options:\n"
                      << "  [path_to_image]   Optional. Path to the image file to process.\n"
                      << "                    Defaults to '../web/public/test-images/0.png' if not provided.\n"
                      << "  show w            Display the GPL warranty disclaimer and exit.\n"
                      << "  show c            Display the GPL redistribution conditions and exit.\n"
                      << "  help, --help, -h  Show this help message and exit.\n" << std::endl
                      << "  --cs <mode>       Set chroma subsampling. <mode> can be 444, 422, or 420.\n" << std::endl;
            return 0;
        }

        if (arg == "show") {
            if (i + 1 < argc) {
                std::string arg2 = argv[i + 1];
                if (arg2 == "w") {
                    std::cout << "--- Warranty Disclaimer (from GPL v3, Sections 15 & 16) ---\n\n"
                                 "THERE IS NO WARRANTY FOR THE PROGRAM, TO THE EXTENT PERMITTED BY\n"
                                 "APPLICABLE LAW. EXCEPT WHEN OTHERWISE STATED IN WRITING THE COPYRIGHT\n"
                                 "HOLDERS AND/OR OTHER PARTIES PROVIDE THE PROGRAM \"AS IS\" WITHOUT WARRANTY\n"
                                 "OF ANY KIND, EITHER EXPRESSED OR IMPLIED, INCLUDING, BUT NOT LIMITED TO,\n"
                                 "THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR\n"
                                 "PURPOSE. THE ENTIRE RISK AS TO THE QUALITY AND PERFORMANCE OF THE PROGRAM\n"
                                 "IS WITH YOU. SHOULD THE PROGRAM PROVE DEFECTIVE, YOU ASSUME THE COST OF\n"
                                 "ALL NECESSARY SERVICING, REPAIR OR CORRECTION.\n\n"
                                 "IN NO EVENT UNLESS REQUIRED BY APPLICABLE LAW OR AGREED TO IN WRITING\n"
                                 "WILL ANY COPYRIGHT HOLDER, OR ANY OTHER PARTY WHO MODIFIES AND/OR CONVEYS\n"
                                 "THE PROGRAM AS PERMITTED ABOVE, BE LIABLE TO YOU FOR DAMAGES, INCLUDING ANY\n"
                                 "GENERAL, SPECIAL, INCIDENTAL OR CONSEQUENTIAL DAMAGES ARISING OUT OF THE\n"
                                 "USE OR INABILITY TO USE THE PROGRAM (INCLUDING BUT NOT LIMITED TO LOSS OF\n"
                                 "DATA OR DATA BEING RENDERED INACCURATE OR LOSSES SUSTAINED BY YOU OR THIRD\n"
                                 "PARTIES OR A FAILURE OF THE PROGRAM TO OPERATE WITH ANY OTHER PROGRAMS),\n"
                                 "EVEN IF SUCH HOLDER OR OTHER PARTY HAS BEEN ADVISED OF THE POSSIBILITY OF\n"
                                 "SUCH DAMAGES.\n" << std::endl;
                    return 0;
                }
                if (arg2 == "c") {
                    std::cout << "--- Conditions for Redistribution (Summary of GPL v3) ---\n\n"
                                 "This program is licensed under the GNU GPL v3. You are welcome to\n"
                                 "redistribute it under certain conditions. Key conditions include:\n\n"
                                 "- If you convey verbatim copies of the source code, you must keep all\n"
                                 "  copyright and license notices intact and provide recipients with a\n"
                                 "  copy of the GPL. (Section 4)\n\n"
                                 "- If you convey modified versions, you must mark your changes, license\n"
                                 "  the entire work under the GPL, and provide the source code.\n"
                                 "  (Sections 5 & 6)\n\n"
                                 "For the full terms and conditions, please see the LICENSE file.\n" << std::endl;
                    return 0;
                }
            }
            std::cerr << "Invalid command. Use 'show w' or 'show c', or 'help' for more info." << std::endl;
            return 1;
        }
    }
    
    std::string imagePath = "../web/public/test-images/0.png";
    auto csMode = ImageCodec::ChromaSubsampling::CS_444;
    bool imagePathSet = false;

    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "--cs") {
            if (i + 1 < argc) {
                std::string mode = argv[++i];
                if (mode == "422") csMode = ImageCodec::ChromaSubsampling::CS_422;
                else if (mode == "420") csMode = ImageCodec::ChromaSubsampling::CS_420;
                else if (mode != "444") {
                    std::cerr << "Warning: Invalid chroma subsampling mode '" << mode << "'. Defaulting to 4:4:4." << std::endl;
                }
            } else {
                std::cerr << "Error: --cs flag requires a value (444, 422, 420)." << std::endl;
                return 1;
            }
        } else if (arg.rfind("-", 0) != 0) { // Does not start with a dash
            imagePath = arg;
        }
    }

    try {
        CodecExplorerApp app(imagePath, csMode);
        app.run();
    } catch (const std::exception& e) {
        std::cerr << "An error occurred: " << e.what() << std::endl;
        return -1;
    }

    return 0;
}