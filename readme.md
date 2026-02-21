# Codec Explorer

[![Build Status](https://github.com/thundermage117/codec/actions/workflows/ci.yml/badge.svg)](https://github.com/thundermage117/codec/actions/workflows/ci.yml) [![License: GPL v3](https://img.shields.io/badge/License-GPL_v3-blue.svg)](LICENSE) [![Coverage](https://sonarcloud.io/api/project_badges/measure?project=thundermage117_codec&metric=coverage)](https://sonarcloud.io/summary/new_code?id=thundermage117_codec) [![Quality gate](https://sonarcloud.io/api/project_badges/quality_gate?project=thundermage117_codec)](https://sonarcloud.io/summary/new_code?id=thundermage117_codec)

An interactive codec laboratory to visualize how transform-based image compression works. The C++ core is compiled to WebAssembly, allowing for real-time, in-browser experimentation.

This project demonstrates:

- 8x8 block splitting
- Color space transformation (RGB → YCbCr)
- Discrete Cosine Transform (DCT)
- Quantization
- Inverse DCT (reconstruction)
- PSNR computation
- Visual difference and artifact analysis
- Block-level coefficient inspection

---

## 🏗 Project Structure

- `core/`: C++ implementation of the codec core.
  - `inc/`: Header files.
  - `src/`: Source files.
  - `build/`: Build artifacts (git-ignored).
- `apps/native/`: Native C++ application for testing the core library.
- `web/`: Svelte 5 + Vite web application.
  - `src/`: TypeScript + Svelte source files.
  - `public/`: Static assets including compiled WASM (`codec.js`, `codec.wasm`).

## ⚙️ Requirements

### For the Web App

- Node.js ≥ 18
- npm

### For Rebuilding the WASM (Optional)

Only needed if you modify the C++ core. The compiled WASM is already checked in to `web/public/`.

- [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html) (`emcc` on PATH)

### For the Native C++ App (Optional)

- CMake ≥ 3.16
- C++17-compatible compiler (clang or g++)
- OpenCV
- macOS / Linux

## 🚀 Getting Started

```bash
git clone https://github.com/thundermage117/codec.git
cd codec
```

### Running the Web App

```bash
cd web
npm install
npm run dev
```

Then open `http://localhost:5173` in your browser.

### Building for Production

```bash
cd web
npm run build
```

Output goes to `web/dist/`. The app is deployed to Vercel on every push to `main`.

### Rebuilding the WASM

If you've modified the C++ core and need to recompile:

```bash
make web
```

This runs `emcc` and outputs `codec.js` + `codec.wasm` into `web/public/`.

### Building and Running the Native App

From the project root:

```bash
make dev
```

This compiles and runs the native app with a default image. To use a custom image:

```bash
./build/codec_app path/to/your/image.png
```

Run `./build/codec_app --help` to see available options.

## 📈 Roadmap

### ✅ Phase 1: Complete

- [x] Static Image Transform Explorer (Web UI)
- [x] Color image input (RGB → YCbCr)
- [x] 8×8 DCT implementation
- [x] Quantization control via quality slider
- [x] Reconstruction (Inverse DCT)
- [x] PSNR computation for Y, Cb, Cr channels

### ✅ Phase 2: Complete

- [x] Artifact maps highlighting differences between original and reconstructed images
- [x] Block-level inspection mode
- [x] Interactive block selection
- [x] Coefficient heatmap visualization
- [x] Zig-zag ordering
- [x] Zero-run visualization

### Phase 3

- [ ] Motion estimation
- [ ] Two-frame input
- [ ] Block matching
- [ ] Motion vector visualization
- [ ] Bitrate comparison

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
