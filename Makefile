# --- CONFIGURATION ---
WEB_COMPILER = emcc
WEB_FLAGS = -Icore/inc -O3 \
            -s WASM=1 \
            -s ALLOW_MEMORY_GROWTH=1 \
            -s EXPORTED_FUNCTIONS='["_init_session", "_process_image", "_get_view_ptr", "_set_view_tint", "_get_psnr_y", "_get_psnr_cr", "_get_psnr_cb", "_get_ssim_y", "_get_ssim_cr", "_get_ssim_cb", "_get_last_bit_estimate", "_inspect_block_data", "_get_coeff_histogram", "_malloc", "_free"]' \
            -s EXPORTED_RUNTIME_METHODS='["cwrap", "ccall", "HEAPU8"]'

# Source: Core C++ + Web Glue C++ (in src folder)
WEB_SOURCES = core/src/*.cpp web/cpp/codec_web.cpp

# Output: Goes directly into the public folder
WEB_OUTPUT  = web/public/codec.js

# Name of your native executable
NATIVE_APP_NAME = codec_app
# Detect cores for parallel build
NPROCS = $(shell sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo 4)

# --- PHONY TARGETS ---
.PHONY: all web web-dev native dev clean test web-test web-test-unit web-test-browser

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

# 2. Run Web Dev Server (Vite + HMR)
web-dev: web
	@echo "🚀 Starting Vite dev server..."
	@cd web && npm run dev

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

# 4. Run Tests
test:
	@echo "🧪 Running Tests..."
	@mkdir -p build
	@cd build && cmake .. && make -j$(NPROCS)
	@cd build && ctest --output-on-failure

# 5. Coverage
coverage:
	@echo "📊 Generating Coverage..."
	@mkdir -p build
	@find build -name "*.gcda" -delete 
	@cd build && cmake .. -DENABLE_COVERAGE=ON && make -j$(NPROCS)
	@cd build && ctest --output-on-failure
	@echo "📈 Generating Sonar-compatible XML report..."
	# In gcovr 8.6, we use the search path at the end instead of --build-root
	gcovr --sonarqube -o coverage.xml -r . --filter core/src/ -e build/ --gcov-ignore-parse-errors=all build

# 6. Sanitize (ASan + UBSan)
sanitize:
	@echo "🛡️ Running with Sanitizers..."
	@mkdir -p build
	@if [ -d build/CMakeCache.txt ]; then rm build/CMakeCache.txt; fi
	@cd build && cmake .. -DENABLE_SANITIZERS=ON && make -j$(NPROCS)
	@cd build && ctest --output-on-failure

# ------------------------------------
# 🌐 JS / WEB TESTS (Vitest)
# ------------------------------------

# 7. Run all JS tests (unit + browser)
web-test:
	@echo "Running JS unit tests..."
	@cd web && npm run test
	@echo "Running JS browser integration tests..."
	@cd web && npm run test:browser

# 8. Unit tests only (fast, no browser)
web-test-unit:
	@cd web && npm run test

# 9. Browser integration tests only
web-test-browser:
	@cd web && npm run test:browser

# ------------------------------------
# 🧹 CLEANUP
# ------------------------------------

clean:
	@echo "🧹 Cleaning..."
	rm -f web/public/codec.js web/public/codec.wasm
	# Delete everything in build EXCEPT for the _deps folder (to keep GTest)
	@if [ -d build ]; then \
		find build -mindepth 1 -maxdepth 1 ! -name '_deps' -exec rm -rf {} +; \
	fi
	@echo "✨ Done."