import { appState, ViewMode } from './state.svelte.js';

export function setupWasm(onReady: () => void, onError?: (message: string) => void): void {
    // codec.js is loaded via a classic <script> tag; if it is missing (e.g. the
    // WASM was never built) the Module global is never defined.
    if (typeof Module === 'undefined') {
        onError?.('Failed to load codec.js. Rebuild the WASM with `make web`.');
        return;
    }
    if (Module.calledRun) {
        onReady();
    } else {
        Module.onRuntimeInitialized = onReady;
        Module.onAbort = (reason: unknown) => onError?.(`WASM failed to initialize: ${String(reason)}`);
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

// Encodes at the given settings for a rate–distortion sample. Unlike
// processImage this leaves the session's processed image untouched and skips
// SSIM, so it is cheap enough to call many times in a row.
export function rdEncode(quality: number, csMode: number, transformType: number): { psnrY: number; bits: number } {
    const psnrY = Module._rd_encode(quality, csMode, transformType);
    return { psnrY, bits: Module._get_rd_bit_estimate() };
}

// Copies the current reconstruction (the RGB view) out of WASM as RGBA.
// Returns null if nothing has been processed yet.
export function getProcessedRgba(): Uint8ClampedArray | null {
    const ptr = Module._get_view_ptr(ViewMode.RGB);
    if (!ptr) return null;
    try {
        const size = appState.imgWidth * appState.imgHeight * 4;
        return new Uint8ClampedArray(Module.HEAPU8.slice(ptr, ptr + size));
    } finally {
        Module._free(ptr);
    }
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

// Must match ImageCodec::CoefficientStats::NUM_BINS.
export const COEFF_BINS = 12;

export interface CoeffStats {
    /** Fraction of AC/detail coefficients per log2 magnitude bin (see binLabel). */
    histogram: number[];
    /** Fraction of AC/detail coefficients that quantize to zero at the given quality. */
    zeroFraction: number;
}

// Luma coefficient statistics for every transform at `quality`, computed with
// the codec's own transforms and quantizers. Keyed by transform value.
// Returns null if WASM is not ready or no image is loaded.
export function getCoeffStats(quality: number): Record<number, CoeffStats> | null {
    const ptr = Module._get_coeff_stats(quality);
    if (!ptr) return null;
    try {
        const view = new DataView(Module.HEAPU8.buffer);
        const record = COEFF_BINS + 1;
        const result: Record<number, CoeffStats> = {};
        for (let mode = 0; mode < 3; mode++) {
            const base = ptr + mode * record * 8;
            const histogram: number[] = [];
            for (let b = 0; b < COEFF_BINS; b++) histogram.push(view.getFloat64(base + b * 8, true));
            result[mode] = { histogram, zeroFraction: view.getFloat64(base + COEFF_BINS * 8, true) };
        }
        return result;
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
