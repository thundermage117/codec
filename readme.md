# Codec Explorer

An interactive codec laboratory to visualize how transform-based image compression works. The C++ core is compiled to WebAssembly, allowing for real-time, in-browser experimentation.

This project aims to demonstrate:

- 8x8 block splitting
- Color Space Transformation (RGB -> YCbCr)
- Discrete Cosine Transform (DCT)
- Quantization
- Inverse DCT (reconstruction)
- PSNR computation
- Visual difference analysis

The long-term goal is to run the codec core in WebAssembly and build a browser-based interactive visualizer.

---

## 🏗 Project Structure

- `core/`: Contains the C++ implementation of the codec core.
  - `inc/`: Header files for the codec core.
  - `src/`: Source files for the codec core.
  - `build/`: Directory for build artifacts (ignored in git).
- `apps/native/`: A native C++ application for testing the core library.
- `web/`: The web application front-end.
  - `public/`: Contains the HTML, CSS, JS, and WASM module for the interactive UI.


## ⚙️ Requirements

### For the Web App

- A modern web browser that supports WebAssembly.
- A local web server to serve the `web/public` directory (e.g., Python's `http.server`).

### For the Native C++ App (Optional)

- CMake ≥ 3.16
- C++17-compatible compiler (clang or g++)
- OpenCV
- macOS / Linux

## 🚀 Getting Started
1. Clone the repository:
   ```bash
    git clone https://github.com/thundermage117/codec.git
    cd codec
    ```

The easiest way to use the Codec Explorer is through the web interface.

### Running the Web App

1.  Navigate to the web directory:
    ```bash
    cd web
    ```
2.  You need a simple local HTTP server to run the application. If you have Python 3, you can run:
    ```bash
    python3 -m http.server --directory public 8000
    ```
3.  Open your web browser and go to `http://localhost:8000`.
4.  Upload an image and adjust the quality slider to see the effects of compression in real-time.

### Building and Running the Native App

If you want to build the native C++ version for testing:

1.  From the project root, you can compile and run the native application with a default image using a single command:

    ```bash
    make dev
    ```
    This will create a `build` directory, compile the code, and run the `codec_app` executable.

2.  **Running with a custom image:**
    After the app has been built, the executable is located at `build/codec_app`. You can run it with your own image from the project root:
    ```bash
    ./build/codec_app path/to/your/image.png
    ```
3. You can run help to see available options:
    ```bash
    ./build/codec_app --help
    ```

## 📈 Roadmap

### ✅ Phase 1: Complete

- [x] Static Image Transform Explorer (Web UI)
- [x] Color Image Input (RGB -> YCbCr)
- [x] 8×8 DCT implementation
- [x] Quantization control via quality slider
- [x] Reconstruction (Inverse DCT)
- [x] PSNR computation for Y, Cb, Cr channels

Phase 2 
- [x] Display artifact maps highlighting differences between original and reconstructed images
- Block-Level Inspection
- Interactive block selection
- Coefficient heatmap visualization
- Zig-zag ordering
- Zero-run visualization

Phase 3 
- Motion Estimation
- Two-frame input
- Block matching
- Motion vector visualization
- Bitrate comparison

## ▶️ Why This Project Exists

Transform-based compression is often treated as a black box.

This project aims to:
- Build intuition for energy compaction
- Explore rate–distortion tradeoffs
- Connect signal processing theory to real implementations
- Bridge native C++ systems code with browser-based visualization

## 📚 Learning Resources
- [Discrete Cosine Transform (DCT) Explained](https://en.wikipedia.org/wiki/Discrete_cosine_transform)
- [Quantization in Video Compression](https://en.wikipedia.org/wiki/Quantization_(signal_processing))
- [PSNR and Video Quality Metrics](https://en.wikipedia.org/wiki/Peak_signal-to-noise_ratio)
- [WebAssembly for C++ Developers](https://webassembly.org/getting-started/developers-guide/)

## 📜 License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing
Contributions are welcome! Please fork the repository and submit a pull request with your improvements or new features.