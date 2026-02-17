import { state } from './state.js';
import { initSession } from './wasm-bridge.js';

export function handleFileSelect(file, onImageLoaded) {
    if (!file) return;

    const img = new Image();
    img.onload = () => {
        let scale = 1.0;
        if (img.width > state.maxDim || img.height > state.maxDim) {
            scale = Math.min(state.maxDim / img.width, state.maxDim / img.height);
        }

        state.imgWidth = Math.floor(img.width * scale);
        state.imgHeight = Math.floor(img.height * scale);

        const originalCanvas = document.getElementById('originalCanvas');
        const processedCanvas = document.getElementById('processedCanvas');

        // Resize canvases
        originalCanvas.width = state.imgWidth;
        originalCanvas.height = state.imgHeight;
        processedCanvas.width = state.imgWidth;
        processedCanvas.height = state.imgHeight;

        const ctx = originalCanvas.getContext('2d');
        ctx.drawImage(img, 0, 0, state.imgWidth, state.imgHeight);
        state.originalImageData = ctx.getImageData(0, 0, state.imgWidth, state.imgHeight);

        // Initialize WASM session with new image
        initSession();

        if (onImageLoaded) onImageLoaded();
    };
    img.src = URL.createObjectURL(file);
}

export function getOriginalContext() {
    return document.getElementById('originalCanvas').getContext('2d');
}

export function getProcessedContext() {
    return document.getElementById('processedCanvas').getContext('2d', { willReadFrequently: true });
}
