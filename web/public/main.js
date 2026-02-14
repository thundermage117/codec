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
const procCtx = processedCanvas.getContext('2d');
const psnrValue = document.getElementById('psnrValue'); // Get the new span

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

        // Process immediately
        applyCodec();
    };
    img.src = URL.createObjectURL(file);
});

// --- 3. Handle Quality Slider ---
qualitySlider.addEventListener('input', () => {
    qualityValue.textContent = qualitySlider.value;
    
    // Only re-process if we have an image and WASM is ready
    if (wasmReady && originalImageData) {
        applyCodec();
    }
});

// --- 4. Main Processing Function ---
function applyCodec() {
    // Safety Checks
    if (!wasmReady) {
        console.warn("WASM not ready yet. Please wait.");
        return;
    }
    if (!originalImageData) return;

    const quality = parseInt(qualitySlider.value);
    const pixelCount = imgWidth * imgHeight;
    const rgbSize = pixelCount * 3; // 3 bytes per pixel (RGB)

    // A. Prepare Input Data (RGBA -> RGB)
    // We allocate this temporary buffer in JS memory first
    const rgbData = new Uint8Array(rgbSize);
    const d = originalImageData.data;
    
    for (let i = 0, j = 0; i < d.length; i += 4, j += 3) {
        rgbData[j]   = d[i];     // R
        rgbData[j+1] = d[i+1];   // G
        rgbData[j+2] = d[i+2];   // B
        // Alpha channel d[i+3] is ignored
    }

    let inputPtr = 0;
    let outputPtr = 0;

    try {
        // B. Allocate Memory on WASM Heap for Input
        inputPtr = Module._malloc(rgbSize);
        if (!inputPtr) throw new Error("Failed to allocate WASM memory for input");

        // C. Copy data into WASM heap
        // CRITICAL FIX: Use a fresh view of the buffer to avoid detached buffer errors
        Module.HEAPU8.set(rgbData, inputPtr);

        // D. Call the C++ function
        // Arguments: inputPtr, width, height, channels, quality
        outputPtr = Module._process_image(inputPtr, imgWidth, imgHeight, 3, quality);

        const psnr = Module._get_last_psnr();
        psnrValue.innerText = psnr.toFixed(2);

        // We can free the input immediately after the C++ function returns
        // because the C++ code has finished reading it.
        Module._free(inputPtr);
        inputPtr = 0; // Prevent double-free in catch block

        if (outputPtr === 0) {
            throw new Error("WASM processing returned null (check console for C++ errors)");
        }

        // E. Read Output Data (RGB) from WASM Heap
        // CRITICAL FIX: Create a NEW view because memory might have grown/moved
        const outputView = new Uint8Array(Module.HEAPU8.buffer, outputPtr, rgbSize);
        
        // Copy the data out to a JS array so we can free the WASM memory
        const outputData = new Uint8Array(outputView);

        // Free the output pointer (C++ malloc'd it, we must free it)
        Module._free(outputPtr);
        outputPtr = 0;

        // F. Convert back to RGBA for Canvas Display
        const finalImageData = new ImageData(imgWidth, imgHeight);
        const fd = finalImageData.data;
        
        for (let i = 0, j = 0; i < outputData.length; i += 3, j += 4) {
            fd[j]   = outputData[i];   // R
            fd[j+1] = outputData[i+1]; // G
            fd[j+2] = outputData[i+2]; // B
            fd[j+3] = 255;             // Alpha (Opaque)
        }

        // G. Draw to canvas
        procCtx.putImageData(finalImageData, 0, 0);

    } catch (err) {
        console.error("WASM Processing Error:", err);
    } finally {
        // Cleanup in case of error to prevent memory leaks
        if (inputPtr !== 0) Module._free(inputPtr);
        if (outputPtr !== 0) Module._free(outputPtr);
    }
}