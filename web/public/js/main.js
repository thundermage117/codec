import { state } from './state.js';
import { setupWasm, getViewPtr, getStats, free, processImage } from './wasm-bridge.js';
import { handleFileSelect, getProcessedContext, getOriginalContext } from './image-manager.js';
import { setupControls, updateComparisonView, updateFileSizeEstimate } from './ui-controls.js';

// DOM Elements
const statusDiv = document.getElementById('status');
const fileInput = document.getElementById('fileInput');

function onWasmReady() {
    state.wasmReady = true;
    if (statusDiv) {
        statusDiv.innerText = "WASM Module Ready!";
        statusDiv.classList.add('ready');
    }

    // Enable controls
    const controls = document.querySelectorAll('input:disabled, button:disabled');
    controls.forEach(el => el.disabled = false);

    console.log("WASM Runtime Initialized (Module)");
}

function render() {
    if (!state.wasmReady || !state.originalImageData) return;

    const rgbaSize = state.imgWidth * state.imgHeight * 4;
    let outputPtr = 0;
    try {
        outputPtr = getViewPtr(state.currentViewMode);
        if (!outputPtr) throw new Error("WASM get_view_ptr returned null");

        // Create ImageData from WASM memory
        // outputPtr is simple offset in HEAPU8
        const dataView = new Uint8ClampedArray(Module.HEAPU8.buffer, outputPtr, rgbaSize);
        const imageData = new ImageData(dataView, state.imgWidth, state.imgHeight);

        const ctx = getProcessedContext();
        ctx.putImageData(imageData, 0, 0);

        // Update Stats
        const stats = getStats();

        const setText = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        setText('psnrY', stats.psnr.y.toFixed(2));
        setText('psnrCr', stats.psnr.cr.toFixed(2));
        setText('psnrCb', stats.psnr.cb.toFixed(2));

        setText('ssimY', stats.ssim.y.toFixed(4));
        setText('ssimCr', stats.ssim.cr.toFixed(4));
        setText('ssimCb', stats.ssim.cb.toFixed(4));

        // Highlight Logic
        const origCtx = getOriginalContext();
        if (origCtx) {
            // Always redraw original to clear artifacts/highlights
            origCtx.putImageData(state.originalImageData, 0, 0);

            if (state.isInspectMode && state.highlightBlock) {
                const bx = state.highlightBlock.x * 8;
                const by = state.highlightBlock.y * 8;
                origCtx.strokeStyle = "#ff0000";
                origCtx.lineWidth = 1;
                origCtx.strokeRect(bx, by, 8, 8);
            }
        }

    } catch (err) {
        console.error("Render error:", err);
    } finally {
        if (outputPtr) free(outputPtr);
    }
}

// Initial Setup
setupWasm(onWasmReady);

// ===== Theme Toggle =====
const themeToggle = document.getElementById('themeToggle');
function updateThemeIcons() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const sunIcon = themeToggle?.querySelector('.icon-sun');
    const moonIcon = themeToggle?.querySelector('.icon-moon');
    if (sunIcon) sunIcon.style.display = isDark ? 'none' : 'block';
    if (moonIcon) moonIcon.style.display = isDark ? 'block' : 'none';
}
updateThemeIcons(); // sync on load

if (themeToggle) {
    themeToggle.addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        if (isDark) {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
        }
        updateThemeIcons();
    });
}

// ===== Drop Zone / File Input =====
const dropZone = document.getElementById('dropZone');

function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    handleFileSelect(file, () => {
        processImage(50, state.currentCsMode);
        updateComparisonView(50);
        render();
        updateFileSizeEstimate();
        // Hide drop zone after successful load
        if (dropZone) dropZone.style.display = 'none';
    });
}

if (fileInput) {
    fileInput.addEventListener('change', (e) => {
        loadFile(e.target.files[0]);
    });
}

if (dropZone) {
    // Click drop zone to trigger file input
    dropZone.addEventListener('click', () => {
        if (fileInput) fileInput.click();
    });

    // Drag events
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const file = e.dataTransfer?.files[0];
        loadFile(file);
    });
}

// Setup UI Controls
setupControls(render);
