import { appState } from './state.svelte.js';

export function setupWasm(onReady: () => void): void {
    if (typeof Module !== 'undefined' && Module.calledRun) {
        onReady();
    } else {
        Module.onRuntimeInitialized = onReady;
    }
}

export function initSession(): void {
    if (!appState.originalImageData) return;

    const rgbaSize = appState.originalImageData.data.length;
    let inputPtr = 0;
    try {
        inputPtr = Module._malloc(rgbaSize);
        Module.HEAPU8.set(appState.originalImageData.data, inputPtr);
        Module._init_session(inputPtr, appState.imgWidth, appState.imgHeight);
    } finally {
        if (inputPtr) Module._free(inputPtr);
    }
}

export function processImage(quality: number, csMode: number): void {
    Module._process_image(quality, csMode);
}

export function getViewPtr(viewMode: number): number {
    return Module._get_view_ptr(viewMode);
}

export function getStats() {
    return {
        psnr: {
            y: Module._get_psnr_y(),
            cr: Module._get_psnr_cr(),
            cb: Module._get_psnr_cb()
        },
        ssim: {
            y: Module._get_ssim_y(),
            cr: Module._get_ssim_cr(),
            cb: Module._get_ssim_cb()
        }
    };
}

export function setViewTint(enabled: number): void {
    Module._set_view_tint(enabled);
}

export function inspectBlockData(blockX: number, blockY: number, channelIndex: number, quality: number): number {
    return Module._inspect_block_data(blockX, blockY, channelIndex, quality, appState.currentCsMode);
}

export function getHeapU8(): Uint8Array {
    return Module.HEAPU8;
}

export function free(ptr: number): void {
    Module._free(ptr);
}
