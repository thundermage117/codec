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
let originalImageData = null;
let imgWidth = 0;
let imgHeight = 0;

const ViewMode = {
    RGB: 0,
    Artifacts: 1,
    Y: 2,
    Cr: 3,
    Cb: 4
};
let currentViewMode = ViewMode.RGB;
let currentCsMode = 444;
const maxDim = 1024; // Downscale large images for performance
let wasmReady = false;

// DOM Elements
const fileInput = document.getElementById('fileInput');
const qualitySlider = document.getElementById('qualitySlider');
const qualityValue = document.getElementById('qualityValue');
const statusDiv = document.getElementById('status');
const originalCanvas = document.getElementById('originalCanvas');
const processedCanvas = document.getElementById('processedCanvas');
const origCtx = originalCanvas.getContext('2d');
const procCtx = processedCanvas.getContext('2d', { willReadFrequently: true });
const psnrY = document.getElementById('psnrY');
const psnrCr = document.getElementById('psnrCr');
const psnrCb = document.getElementById('psnrCb');
const viewModeRadios = document.querySelectorAll('input[name="view_mode"]');
const csRadios = document.querySelectorAll('input[name="chroma_subsampling"]');
const comparisonSlider = document.getElementById('comparisonSlider');
const comparisonViewer = document.querySelector('.comparison-viewer');
const tintToggle = document.getElementById('tint_toggle');

// --- 1. WASM Initialization Handler ---
Module.onRuntimeInitialized = () => {
    wasmReady = true;
    if (statusDiv) {
        statusDiv.innerText = "WASM Module Ready!";
        statusDiv.classList.add('ready');
    }

    // Enable controls now that WASM is ready
    if (fileInput) fileInput.disabled = false;
    if (qualitySlider) qualitySlider.disabled = false;
    viewModeRadios.forEach(radio => radio.disabled = false);
    csRadios.forEach(radio => radio.disabled = false);
    if (comparisonSlider) comparisonSlider.disabled = false;
    if (tintToggle) tintToggle.disabled = false;

    console.log("WASM Runtime Initialized");
};

// --- 2. Handle File Input ---
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const img = new Image();
    img.onload = () => {
        // Calculate scale to fit max dimensions
        let scale = 1.0;
        if (img.width > maxDim || img.height > maxDim) {
            scale = Math.min(maxDim / img.width, maxDim / img.height);
        }

        imgWidth = Math.floor(img.width * scale);
        imgHeight = Math.floor(img.height * scale);

        // Resize canvases
        originalCanvas.width = imgWidth;
        originalCanvas.height = imgHeight;
        processedCanvas.width = imgWidth;
        processedCanvas.height = imgHeight;

        // Draw original image to canvas to get pixel data
        origCtx.drawImage(img, 0, 0, imgWidth, imgHeight);
        originalImageData = origCtx.getImageData(0, 0, imgWidth, imgHeight);

        // Reset comparison slider to a 50/50 view
        if (comparisonSlider && processedCanvas) {
            comparisonSlider.value = 50;
            processedCanvas.style.clipPath = `polygon(50% 0, 100% 0, 100% 100%, 50% 100%)`;
        }

        // Initialize a new session in WASM
        initSession();
    };
    img.src = URL.createObjectURL(file);
});

// --- 3. Debounce Helper ---
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// --- 4. Handle Controls ---
const debouncedUpdate = debounce(() => updateAndRender(), 150);

qualitySlider.addEventListener('input', () => {
    qualityValue.textContent = qualitySlider.value;
    if (originalImageData) {
        debouncedUpdate();
    }
});

viewModeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
        switch (e.target.value) {
            case 'artifacts': currentViewMode = ViewMode.Artifacts; break;
            case 'y': currentViewMode = ViewMode.Y; break;
            case 'cr': currentViewMode = ViewMode.Cr; break;
            case 'cb': currentViewMode = ViewMode.Cb; break;
            default: currentViewMode = ViewMode.RGB; break;
        }
        // Only re-render, don't re-process
        if (originalImageData) {
            render();
        }
    });
});

csRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
        currentCsMode = parseInt(e.target.value, 10);
        // Re-process the image with the new setting
        if (originalImageData) {
            updateAndRender();
        }
    });
});

if (tintToggle) {
    tintToggle.addEventListener('change', (e) => {
        if (wasmReady) {
            Module._set_view_tint(e.target.checked ? 1 : 0);
            if (originalImageData) {
                render();
            }
        }
    });
}

function updateComparisonView(percent) {
    // Clamp the value between 0 and 100
    const clampedPercent = Math.max(0, Math.min(100, percent));

    // Update the slider's visual position
    comparisonSlider.value = clampedPercent;

    // Update the clip-path of the top canvas (processed) to reveal the bottom (original)
    processedCanvas.style.clipPath = `polygon(${clampedPercent}% 0, 100% 0, 100% 100%, ${clampedPercent}% 100%)`;
}

comparisonSlider.addEventListener('input', (e) => updateComparisonView(e.target.value));

let isDragging = false;

function handleInteraction(clientX) {
    if (!comparisonViewer) return;
    const rect = comparisonViewer.getBoundingClientRect();
    const x = clientX - rect.left;
    const percent = (x / rect.width) * 100;
    updateComparisonView(percent);
}

// --- Mouse Events for Direct Image Interaction ---
comparisonViewer.addEventListener('mousedown', (e) => {
    isDragging = true;
    comparisonViewer.style.cursor = 'grabbing';
    handleInteraction(e.clientX);
});

document.addEventListener('mouseup', () => {
    isDragging = false;
    if (comparisonViewer) comparisonViewer.style.cursor = 'col-resize';
});

document.addEventListener('mouseleave', () => { isDragging = false; });

document.addEventListener('mousemove', (e) => {
    if (isDragging) {
        handleInteraction(e.clientX);
    }
});

// --- Touch Events for Direct Image Interaction ---
comparisonViewer.addEventListener('touchstart', (e) => {
    isDragging = true;
    handleInteraction(e.touches[0].clientX);
});

document.addEventListener('touchend', () => { isDragging = false; });
document.addEventListener('touchcancel', () => { isDragging = false; });

document.addEventListener('touchmove', (e) => {
    if (isDragging) {
        // Prevent scrolling while dragging on the image
        e.preventDefault();
        handleInteraction(e.touches[0].clientX);
    }
}, { passive: false }); // Required to allow preventDefault

// --- 5. Core WASM Interaction Functions ---

function initSession() {
    if (!originalImageData) return;

    // The C++ side now expects a 4-channel RGBA buffer.
    const rgbaSize = originalImageData.data.length;

    let inputPtr = 0;
    try {
        // Allocate memory in the WASM heap and copy the image data.
        inputPtr = Module._malloc(rgbaSize);
        Module.HEAPU8.set(originalImageData.data, inputPtr);
        Module._init_session(inputPtr, imgWidth, imgHeight);
    } finally {
        if (inputPtr) Module._free(inputPtr);
    }

    // Trigger initial processing and rendering
    updateAndRender();
}

function updateAndRender() {
    if (!wasmReady || !originalImageData) return;

    const quality = parseInt(qualitySlider.value);
    // Call the updated C++ function with quality and chroma subsampling mode.
    Module._process_image(quality, currentCsMode);

    // After updating, render the current view
    render();
}

function render() {
    if (!wasmReady || !originalImageData) return;

    const rgbaSize = imgWidth * imgHeight * 4;
    let outputPtr = 0;
    try {
        // Get the pointer for the current view
        outputPtr = Module._get_view_ptr(currentViewMode);
        if (!outputPtr) throw new Error("WASM get_view_ptr returned null");

        // The C++ module now returns a 4-channel RGBA buffer.
        // We can create an ImageData object directly from this buffer.
        const imageDataBytes = new Uint8ClampedArray(Module.HEAPU8.buffer, outputPtr, rgbaSize);
        const imageData = new ImageData(imageDataBytes, imgWidth, imgHeight);
        procCtx.putImageData(imageData, 0, 0);

        // Update stats
        psnrY.textContent = Module._get_psnr_y().toFixed(2);
        psnrCr.textContent = Module._get_psnr_cr().toFixed(2);
        psnrCb.textContent = Module._get_psnr_cb().toFixed(2);

    } catch (err) {
        console.error("WASM render error:", err);
    } finally {
        // The C++ code malloc'd this, so JS must free it.
        if (outputPtr) Module._free(outputPtr);
    }
}