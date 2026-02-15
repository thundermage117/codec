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

// --- 5. Core WASM Interaction Functions ---

function initSession() {
    if (!originalImageData) return;

    const rgbSize = imgWidth * imgHeight * 3;
    const rgbData = new Uint8Array(rgbSize);
    const d = originalImageData.data;
    for (let i = 0, j = 0; i < d.length; i += 4, j += 3) {
        rgbData[j]   = d[i];     // R
        rgbData[j+1] = d[i+1];   // G
        rgbData[j+2] = d[i+2];   // B
        // Alpha channel d[i+3] is ignored
    }

    let inputPtr = 0;
    try {
        inputPtr = Module._malloc(rgbSize);
        Module.HEAPU8.set(rgbData, inputPtr);
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
    Module._update_quality(quality);

    // After updating, render the current view
    render();
}

function render() {
    if (!wasmReady || !originalImageData) return;

    const rgbSize = imgWidth * imgHeight * 3;
    let inputPtr = 0;
    let outputPtr = 0;
    try {
        // Get the pointer for the current view
        outputPtr = Module._get_view_ptr(currentViewMode);
        if (!outputPtr) throw new Error("WASM get_view_ptr returned null");

        // Read the image data from the WASM heap
        const outputView = new Uint8Array(Module.HEAPU8.buffer, outputPtr, rgbSize);
        const outputData = new Uint8Array(outputView);

        // Convert RGB to RGBA for canvas display
        const finalImageData = new ImageData(imgWidth, imgHeight);
        const fd = finalImageData.data;
        for (let i = 0, j = 0; i < outputData.length; i += 3, j += 4) {
            fd[j]   = outputData[i];   // R
            fd[j+1] = outputData[i+1]; // G
            fd[j+2] = outputData[i+2]; // B
            fd[j+3] = 255;             // Alpha (Opaque)
        }
        procCtx.putImageData(finalImageData, 0, 0);

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