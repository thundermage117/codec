import { appState } from './state.svelte.js';
import { initSession } from './wasm-bridge.js';

export function handleFileSelect(
    file: File,
    originalCanvas: HTMLCanvasElement,
    processedCanvas: HTMLCanvasElement,
    onImageLoaded?: () => void
): void {
    if (!file) return;

    const img = new Image();
    img.onload = () => {
        let scale = 1.0;
        if (img.width > appState.maxDim || img.height > appState.maxDim) {
            scale = Math.min(appState.maxDim / img.width, appState.maxDim / img.height);
        }

        appState.imgWidth = Math.floor(img.width * scale);
        appState.imgHeight = Math.floor(img.height * scale);

        originalCanvas.width = appState.imgWidth;
        originalCanvas.height = appState.imgHeight;
        processedCanvas.width = appState.imgWidth;
        processedCanvas.height = appState.imgHeight;

        const ctx = originalCanvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, appState.imgWidth, appState.imgHeight);
        appState.originalImageData = ctx.getImageData(0, 0, appState.imgWidth, appState.imgHeight);

        initSession();

        if (onImageLoaded) onImageLoaded();
    };
    img.src = URL.createObjectURL(file);
}
