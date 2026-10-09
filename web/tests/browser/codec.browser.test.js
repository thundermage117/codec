// Codec pipeline end to end against the real WASM build (web/public/codec.js),
// not the Module mock used by the other browser tests.
import { describe, it, expect, beforeAll } from 'vitest';
import { appState, ViewMode } from '../../src/lib/state.svelte.js';
import { initSession, processImage, rdEncode, getStats, getLastBitEstimate, getProcessedRgba, getCoeffStats } from '../../src/lib/wasm-bridge.js';
import { Transform, TRANSFORMS } from '../../src/lib/transforms.js';

const WIDTH = 384;
const HEIGHT = 256;
const CS_420 = 420;

function loadRealWasm() {
    return new Promise((resolve, reject) => {
        globalThis.Module = {
            locateFile: (file) => `/public/${file}`,
            onRuntimeInitialized: () => resolve(),
            onAbort: (reason) => reject(new Error(`WASM aborted: ${reason}`)),
        };
        const script = document.createElement('script');
        script.src = '/public/codec.js';
        script.onerror = () => reject(new Error('Failed to load /public/codec.js'));
        document.head.appendChild(script);
    });
}

async function loadTestImage(index) {
    const blob = await (await fetch(`/public/test-images/${index}.png`)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, WIDTH, HEIGHT);
    return ctx.getImageData(0, 0, WIDTH, HEIGHT);
}

// Copies the RGBA buffer for a view mode out of the WASM heap.
function readView(mode) {
    const ptr = Module._get_view_ptr(mode);
    expect(ptr).not.toBe(0);
    const pixels = Module.HEAPU8.slice(ptr, ptr + WIDTH * HEIGHT * 4);
    Module._free(ptr);
    return pixels;
}

function distinctValues(rgba) {
    const seen = new Set();
    for (let i = 0; i < rgba.length; i += 4) seen.add(rgba[i]);
    return seen.size;
}

beforeAll(async () => {
    await loadRealWasm();
    appState.originalImageData = await loadTestImage(3);
    appState.imgWidth = WIDTH;
    appState.imgHeight = HEIGHT;
    initSession();
}, 30000);

describe('codec with the real WASM module', () => {
    it.each(TRANSFORMS)('$label encodes with sane PSNR and bit estimate', (t) => {
        processImage(50, CS_420, t.value);
        const { psnr } = getStats();
        expect(psnr.y).toBeGreaterThan(28);
        expect(psnr.y).toBeLessThan(60);

        const bpp = getLastBitEstimate() / (WIDTH * HEIGHT);
        expect(bpp).toBeGreaterThan(0.05);
        expect(bpp).toBeLessThan(4);
    });

    it('CDF 9/7 beats Haar at the same quality', () => {
        const haar = rdEncode(20, CS_420, Transform.Haar);
        const cdf = rdEncode(20, CS_420, Transform.CDF97);
        expect(cdf.psnrY).toBeGreaterThan(haar.psnrY);
        expect(cdf.bits).toBeLessThan(haar.bits);
    });

    it('rdEncode leaves the displayed result untouched', () => {
        processImage(80, CS_420, Transform.DCT);
        const before = { psnr: getStats().psnr.y, bits: getLastBitEstimate(), rgb: readView(ViewMode.RGB) };

        rdEncode(5, CS_420, Transform.CDF97);

        expect(getStats().psnr.y).toBe(before.psnr);
        expect(getLastBitEstimate()).toBe(before.bits);
        expect(readView(ViewMode.RGB)).toEqual(before.rgb);
    });

    it('Subbands view draws the wavelet pyramid', () => {
        processImage(50, CS_420, Transform.CDF97);
        const subbands = readView(ViewMode.Subbands);
        const rgb = readView(ViewMode.RGB);

        expect(distinctValues(subbands)).toBeGreaterThan(16);
        expect(subbands).not.toEqual(rgb);
        // Grayscale map: R == G == B everywhere.
        for (let i = 0; i < subbands.length; i += 4 * 97) {
            expect(subbands[i + 1]).toBe(subbands[i]);
            expect(subbands[i + 2]).toBe(subbands[i]);
        }
    });

    it('Subbands view falls back to the reconstruction for DCT', () => {
        processImage(50, CS_420, Transform.DCT);
        expect(readView(ViewMode.Subbands)).toEqual(readView(ViewMode.RGB));
    });

    it('getProcessedRgba returns the same pixels as the RGB view', () => {
        processImage(40, CS_420, Transform.DCT);
        const recon = getProcessedRgba();
        expect(recon).not.toBeNull();
        expect(recon.length).toBe(WIDTH * HEIGHT * 4);
        expect(Array.from(recon.subarray(0, 4096))).toEqual(Array.from(readView(ViewMode.RGB).subarray(0, 4096)));
    });

    it('edge-distortion map is populated at low quality', () => {
        // Smoke test of the real map; the per-channel behaviour is covered by
        // CodecAnalysisTest.EdgeDistortionSeesNonBlueChannels.
        processImage(5, CS_420, Transform.DCT);
        const edges = readView(ViewMode.EdgeDistortion);
        let nonZero = 0;
        for (let i = 0; i < edges.length; i += 4) if (edges[i] > 0) nonZero++;
        expect(nonZero).toBeGreaterThan(WIDTH * HEIGHT * 0.05);
    });

    it('getCoeffStats gives normalised histograms whose zeroed share falls as quality rises', () => {
        const low = getCoeffStats(10);
        const high = getCoeffStats(90);
        for (const t of TRANSFORMS) {
            const sum = low[t.value].histogram.reduce((a, b) => a + b, 0);
            expect(sum).toBeCloseTo(1, 6);
            expect(low[t.value].histogram).toEqual(high[t.value].histogram);
            expect(low[t.value].zeroFraction).toBeGreaterThan(high[t.value].zeroFraction);
        }
    });
});
