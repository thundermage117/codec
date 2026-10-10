# --- CONFIGURATION ---
WEB_COMPILER = emcc
# C functions exported to JavaScript (keep in sync with web/src/types/wasm.d.ts)
WEB_EXPORTS = _init_session _process_image _preview_image _rd_encode _get_rd_bit_estimate \
              _get_view_ptr _set_view_tint _set_artifact_gain \
              _get_psnr_y _get_psnr_cr _get_psnr_cb \
              _get_ssim_y _get_ssim_cr _get_ssim_cb \
              _get_last_bit_estimate _inspect_block_data _get_coeff_stats \
              _init_me_session _run_motion_estimation _get_mv_count \
              _get_me_residual_ptr _get_search_steps _get_search_step_count \
              _malloc _free
comma := ,
empty :=
space := $(empty) $(empty)
WEB_EXPORTS_JSON = [$(subst $(space),$(comma),$(foreach f,$(WEB_EXPORTS),"$(f)"))]

WEB_FLAGS = -Icore/inc -O3 \
            -s WASM=1 \
            -s ALLOW_MEMORY_GROWTH=1 \
            -s EXPORTED_FUNCTIONS='$(WEB_EXPORTS_JSON)' \
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

# CMake options are cached in build/, so every target states them explicitly;
# otherwise `make coverage` would leave coverage instrumentation on for the
# next `make test`.
PLAIN_FLAGS = -DENABLE_COVERAGE=OFF -DENABLE_SANITIZERS=OFF

# 3. Native Dev Loop
dev:
	@echo "🔥 Building Native App..."
	@mkdir -p build
	@cd build && cmake .. $(PLAIN_FLAGS) && make -j$(NPROCS)
	@echo "🚀 Running Native App..."
	@cd build && ./$(NATIVE_APP_NAME)

# 4. Run Tests
test:
	@echo "🧪 Running Tests..."
	@mkdir -p build
	@cd build && cmake .. $(PLAIN_FLAGS) && make -j$(NPROCS)
	@cd build && ctest --output-on-failure

# 5. Coverage
coverage:
	@echo "📊 Generating Coverage..."
	@mkdir -p build
	@find build -name "*.gcda" -delete
	@cd build && cmake .. -DENABLE_COVERAGE=ON -DENABLE_SANITIZERS=OFF && make -j$(NPROCS)
	@cd build && ctest --output-on-failure
	@echo "📈 Generating Sonar-compatible XML report..."
	# In gcovr 8.6, we use the search path at the end instead of --build-root
	gcovr --sonarqube -o coverage.xml -r . --filter core/src/ -e build/ --gcov-ignore-parse-errors=all build

# 6. Sanitize (ASan + UBSan) in its own build directory
#
# Some toolchains ship a broken ASan runtime (Apple clang 17 on macOS 26
# deadlocks inside __asan::InitializeShadowMemory before main). A tiny probe
# binary is run under a 10 s watchdog first; if ASan can't start, fall back to
# UBSan only rather than hanging. CI runs the full ASan + UBSan set on Linux.
SANITIZE_DIR = build-sanitize

sanitize:
	@echo "🛡️ Running with Sanitizers..."
	@mkdir -p $(SANITIZE_DIR)
	@printf 'int main(){return 0;}\n' > $(SANITIZE_DIR)/asan_probe.cpp
	@SANITIZERS=address,undefined; \
	if ! $(CXX) -fsanitize=address $(SANITIZE_DIR)/asan_probe.cpp -o $(SANITIZE_DIR)/asan_probe 2>/dev/null || \
	   ! perl -e 'alarm 10; exec @ARGV' $(SANITIZE_DIR)/asan_probe; then \
		echo "⚠️  AddressSanitizer is unavailable with this toolchain; running UndefinedBehaviorSanitizer only."; \
		SANITIZERS=undefined; \
	fi; \
	cd $(SANITIZE_DIR) && cmake .. -DENABLE_SANITIZERS=ON -DSANITIZERS=$$SANITIZERS -DENABLE_COVERAGE=OFF && make -j$(NPROCS) && \
	UBSAN_OPTIONS=halt_on_error=1:print_stacktrace=1 ctest --output-on-failure

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