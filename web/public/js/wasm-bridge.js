import { state } from './state.js';

// Setup WASM runtime callback
export function setupWasm(onReady) {
    if (typeof Module !== 'undefined' && Module.calledRun) {
        onReady();
    } else {
        // Assume Module is available globally via codec.js
        Module.onRuntimeInitialized = onReady;
    }
}

export function initSession() {
    if (!state.originalImageData) return;

    const rgbaSize = state.originalImageData.data.length;
    let inputPtr = 0;
    try {
        inputPtr = Module._malloc(rgbaSize);
        Module.HEAPU8.set(state.originalImageData.data, inputPtr);
        Module._init_session(inputPtr, state.imgWidth, state.imgHeight);
    } finally {
        if (inputPtr) Module._free(inputPtr);
    }
}

export function processImage(quality, csMode) {
    Module._process_image(quality, csMode);
}

export function getViewPtr(viewMode) {
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

export function setViewTint(enabled) {
    Module._set_view_tint(enabled ? 1 : 0);
}

export function inspectBlockData(blockX, blockY, channelIndex, quality) {
    return Module._inspect_block_data(blockX, blockY, channelIndex, quality);
}

export function getHeapU8() {
    return Module.HEAPU8;
}

export function free(ptr) {
    Module._free(ptr);
}
