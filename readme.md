# Codec Explorer

An interactive codec laboratory built in C++ (and later WebAssembly) to visualize how transform-based video compression works.

This project aims to demonstrate:

- 8x8 block splitting
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
- `web/`: Future directory for WebAssembly bindings and browser visualization code.


## ⚙️ Requirements

- CMake ≥ 3.16
- C++17-compatible compiler (clang or g++)
- macOS / Linux

## 🚀 Getting Started
1. Clone the repository:
   ```bash
   git clone
    ```
2. Navigate to the core directory and build the codec:
    ```bash
    cd core
    mkdir build
    cd build
    cmake ..
    make
    ```
3. Run the codec to see the output:
    ```bash
    ./codec_core
    ```

## 📈 Roadmap

### Phase 1 

- Static Image Transform Explorer
- Grayscale image input
- 8×8 DCT implementation
- Quantization control
- Reconstruction
- PSNR computation

Phase 2 
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

## 🤝 Contributing
Contributions are welcome! Please fork the repository and submit a pull request with your improvements or new features.