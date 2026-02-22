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

export function processImage(quality: number, csMode: number, transformType?: number): void {
    const t = transformType !== undefined ? transformType : appState.transformType;
    Module._process_image(quality, csMode, t);
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

export function getLastBitEstimate(): number {
    return Module._get_last_bit_estimate();
}

export function setViewTint(enabled: number): void {
    Module._set_view_tint(enabled);
}

export function setArtifactGain(gain: number): void {
    Module._set_artifact_gain(gain);
}

export function inspectBlockData(blockX: number, blockY: number, channelIndex: number, quality: number, transformType?: number): number {
    const t = transformType !== undefined ? transformType : appState.transformType;
    return Module._inspect_block_data(blockX, blockY, channelIndex, quality, appState.currentCsMode, t);
}

// Returns normalized DCT and DWT AC coefficient histograms for the Y channel.
// num_bins bins from [0, max_val); the last bin is an overflow bucket.
// Returns null if WASM is not ready or no image is loaded.
export function getCoeffHistogram(numBins: number, maxVal: number): { dct: number[]; dwt: number[] } | null {
    const ptr = Module._get_coeff_histogram(numBins, maxVal);
    if (!ptr) return null;
    try {
        const view = new DataView(Module.HEAPU8.buffer);
        const dct: number[] = [];
        const dwt: number[] = [];
        for (let i = 0; i < numBins; i++) {
            dct.push(view.getFloat64(ptr + i * 8, true));
            dwt.push(view.getFloat64(ptr + (numBins + i) * 8, true));
        }
        return { dct, dwt };
    } finally {
        Module._free(ptr);
    }
}

export function getHeapU8(): Uint8Array {
    return Module.HEAPU8;
}

export function free(ptr: number): void {
    Module._free(ptr);
}
