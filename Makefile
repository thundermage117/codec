# --- CONFIGURATION ---
WEB_COMPILER = emcc
WEB_FLAGS = -Icore/inc -O3 \
            -s WASM=1 \
            -s ALLOW_MEMORY_GROWTH=1 \
            -s EXPORTED_FUNCTIONS='["_init_session", "_process_image", "_get_view_ptr", "_get_psnr_y", "_get_psnr_cr", "_get_psnr_cb", "_malloc", "_free"]' \
            -s EXPORTED_RUNTIME_METHODS='["cwrap", "ccall", "HEAPU8"]'

# Source: Core C++ + Web Glue C++ (in src folder)
WEB_SOURCES = core/src/*.cpp web/src/codec_web.cpp

# Output: Goes directly into the public folder
WEB_OUTPUT  = web/public/codec.js

# Name of your native executable
NATIVE_APP_NAME = codec_app
# Detect cores for parallel build
NPROCS = $(shell sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo 4)

# --- PHONY TARGETS ---
.PHONY: all web web-dev native dev clean

# Default: Build & Run Native
all: dev

# ------------------------------------
# 🌐 WEB WORKFLOW (Vercel Ready)
# ------------------------------------

# 1. Build Web (WASM)
web:
	@echo "🌐 Compiling WebAssembly..."
	# Ensure public directory exists
	@mkdir -p web/public
	$(WEB_COMPILER) $(WEB_SOURCES) $(WEB_FLAGS) -o $(WEB_OUTPUT)
	@echo "✅ Web build complete: $(WEB_OUTPUT)"

# 2. Run Web Server (Serves only the public folder!)
web-dev: web
	@echo "🚀 Starting server at http://localhost:8000"
	@cd web/public && python3 -m http.server 8000

# ------------------------------------
# 🖥️ NATIVE WORKFLOW
# ------------------------------------

# 3. Native Dev Loop
dev:
	@echo "🔥 Building Native App..."
	@mkdir -p build
	@cd build && cmake .. && make -j$(NPROCS)
	@echo "🚀 Running Native App..."
	@cd build && ./$(NATIVE_APP_NAME)

# ------------------------------------
# 🧹 CLEANUP
# ------------------------------------

clean:
	@echo "🧹 Cleaning..."
	rm -f web/public/codec.js web/public/codec.wasm
	rm -rf build
	@echo "✨ Done."