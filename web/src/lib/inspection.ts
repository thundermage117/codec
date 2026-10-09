import { appState, ViewMode } from './state.svelte.js';
import { inspectBlockData, getProcessedRgba } from './wasm-bridge.js';
import { hideBasisPopover, setCachedGridData } from './basis-popover.js';
import { renderGrid, renderLossMeter, renderZigzagArray, renderEntropySummary, stopReconstructionAnimation } from './grid-renderer.js';
import { estimateBlockBits, getEntropySymbols } from './dct-utils.js';

// Index of the quantized grid within BlockDebugData (original, coefficients,
// quantTable, quantized, reconstructed — 64 doubles each).
const QUANTIZED_GRID = 3;

/**
 * The block coded just before (blockX, blockY) in a non-interleaved raster
 * scan of this channel, in the original-image block coordinates that
 * inspectBlockData expects; null for the first block. Subsampled chroma has
 * its own, coarser block grid, so the step back happens in that grid.
 */
export function previousBlockInScan(blockX: number, blockY: number, channelIndex: number): { x: number; y: number } | null {
    const chroma = channelIndex !== 0;
    const scaleX = chroma && appState.currentCsMode !== 444 ? 2 : 1;
    const scaleY = chroma && appState.currentCsMode === 420 ? 2 : 1;
    const blocksPerRow = Math.ceil(Math.ceil(appState.imgWidth / scaleX) / 8);

    const cx = Math.floor(blockX / scaleX);
    const cy = Math.floor(blockY / scaleY);
    let px: number, py: number;
    if (cx > 0) { px = cx - 1; py = cy; }
    else if (cy > 0) { px = blocksPerRow - 1; py = cy - 1; }
    else return null;
    return { x: px * scaleX, y: py * scaleY };
}

export function inspectBlock(blockX: number, blockY: number): void {
    hideBasisPopover();
    stopReconstructionAnimation();

    const coordsSpan = document.getElementById('blockCoords');
    const qTableType = document.getElementById('qTableType');
    const qTableType2 = document.getElementById('qTableType2');

    if (coordsSpan) coordsSpan.innerText = `${blockX * 8}, ${blockY * 8} (Block ${blockX},${blockY})`;

    let channelIndex = 0;
    if (appState.currentViewMode === ViewMode.Cr) channelIndex = 1;
    if (appState.currentViewMode === ViewMode.Cb) channelIndex = 2;

    const tableLabel = (channelIndex === 0) ? 'Luma' : 'Chroma';
    if (qTableType) qTableType.innerText = tableLabel;
    if (qTableType2) qTableType2.innerText = tableLabel;

    // Read the previous block's quantized DC first: inspectBlockData returns a
    // pointer to one shared buffer that the next call overwrites.
    const prev = previousBlockInScan(blockX, blockY, channelIndex);
    let prevDc = 0;
    if (prev) {
        const prevPtr = inspectBlockData(prev.x, prev.y, channelIndex, appState.quality);
        if (prevPtr) prevDc = new Float64Array(Module.HEAPU8.buffer, prevPtr + QUANTIZED_GRID * 64 * 8, 1)[0];
    }

    const ptr = inspectBlockData(blockX, blockY, channelIndex, appState.quality);
    if (!ptr) {
        console.error('Failed to inspect block: Ptr is null');
        return;
    }

    const blockSize = 64;
    const readGrid = (offsetIdx: number): Float64Array => {
        const startBytes = ptr + (offsetIdx * blockSize * 8);
        return new Float64Array(Module.HEAPU8.buffer, startBytes, blockSize);
    };

    const originalData = readGrid(0);
    const coeffData = readGrid(1);
    const qtData = readGrid(2);
    const quantData = readGrid(QUANTIZED_GRID);
    const reconData = readGrid(4);

    const errorData = new Float64Array(64);
    for (let i = 0; i < 64; i++) {
        errorData[i] = originalData[i] - reconData[i];
    }

    const dequantizedData = new Float64Array(64);
    for (let i = 0; i < 64; i++) {
        dequantizedData[i] = quantData[i] * qtData[i];
    }

    setCachedGridData({ coeffData, qtData, quantData, dequantizedData });

    let originalRGB: Uint8ClampedArray | null = null;
    let reconstructedRGB: Uint8ClampedArray | null = null;

    if (appState.currentViewMode === ViewMode.RGB) {
        const w = appState.imgWidth;
        const h = appState.imgHeight;
        originalRGB = getBlockRGB(appState.originalImageData!.data, w, h, blockX, blockY);
        // The viewer's canvases are unmounted while inspecting, so read the
        // reconstruction straight from the codec session.
        const recon = getProcessedRgba();
        if (recon) reconstructedRGB = getBlockRGB(recon, w, h, blockX, blockY);
    }

    let mse = 0;
    let peakError = 0;
    let zeroCount = 0;

    for (let i = 0; i < 64; i++) {
        mse += errorData[i] * errorData[i];
        peakError = Math.max(peakError, Math.abs(errorData[i]));
        if (Math.abs(quantData[i]) < 0.5) zeroCount++;
    }
    mse /= 64;

    const mseClass = mse < 5 ? 'good' : mse < 20 ? 'moderate' : 'poor';
    const peakClass = peakError < 10 ? 'good' : peakError < 30 ? 'moderate' : 'poor';
    const zeroPercent = Math.round((zeroCount / 64) * 100);
    const compClass = zeroPercent > 70 ? 'good' : zeroPercent > 40 ? 'moderate' : 'poor';

    const setStatEl = (id: string, text: string, colorClass: string | null, parentBgClass: string | null) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerText = text;
        el.classList.remove('stat-good', 'stat-moderate', 'stat-poor');
        if (colorClass) el.classList.add(`stat-${colorClass}`);
        const parent = el.closest('.stat-item');
        if (parent) {
            parent.classList.remove('stat-good-bg', 'stat-moderate-bg', 'stat-poor-bg');
            if (parentBgClass) parent.classList.add(`stat-${parentBgClass}-bg`);
        }
    };

    setStatEl('statMSE', mse >= 100 ? mse.toFixed(0) : mse.toFixed(2), mseClass, mseClass);
    setStatEl('statPeakError', peakError >= 100 ? peakError.toFixed(0) : peakError.toFixed(1), peakClass, peakClass);
    setStatEl('statZeros', `${zeroCount}/64`, null, null);
    setStatEl('statCompression', `${zeroPercent}%`, compClass, compClass);

    const estBits = estimateBlockBits(quantData, prevDc);
    const bpp = estBits / 64;

    // Good bpp is strictly less than 1.5, moderate is < 3.0, otherwise poor.
    const bppClass = bpp < 1.5 ? 'good' : bpp < 3.0 ? 'moderate' : 'poor';
    setStatEl('statEstBits', `${estBits}`, null, null);
    setStatEl('statBpp', bpp.toFixed(2), bppClass, bppClass);

    renderGrid('gridOriginal', originalRGB ?? originalData, 'intensity', 'original', appState.currentViewMode === ViewMode.RGB);
    renderGrid('gridDCT', coeffData, 'frequency', 'transform');
    renderGrid('gridQuantized', quantData, 'frequency', 'quantized');
    renderGrid('gridQuantized2', quantData, 'frequency', 'quantized');
    renderGrid('gridQuantizedAdvanced', quantData, 'frequency', 'quantized');
    renderGrid('gridDequantized', dequantizedData, 'frequency', 'dequantized');
    renderGrid('gridReconstructed', reconstructedRGB ?? reconData, 'intensity', 'reconstructed', appState.currentViewMode === ViewMode.RGB);
    renderGrid('gridQuantTable', qtData, 'qtable', 'qtable');
    renderGrid('gridError', Array.from(errorData), 'error', 'error');

    renderLossMeter(mse, peakError);
    renderZigzagArray(quantData);

    const entropySymbols = getEntropySymbols(quantData, prevDc);
    renderEntropySummary(entropySymbols);
}

// Extracts an 8×8 RGB block from an RGBA buffer. Partial blocks at the
// right/bottom edges are padded by edge replication, as the codec does.
function getBlockRGB(pixels: Uint8ClampedArray, w: number, h: number, bx: number, by: number): Uint8ClampedArray {
    const data = new Uint8ClampedArray(64 * 3);

    for (let dy = 0; dy < 8; dy++) {
        for (let dx = 0; dx < 8; dx++) {
            const x = Math.min(bx * 8 + dx, w - 1);
            const y = Math.min(by * 8 + dy, h - 1);
            const idx = (y * w + x) * 4;
            const i = dy * 8 + dx;
            data[i * 3] = pixels[idx];
            data[i * 3 + 1] = pixels[idx + 1];
            data[i * 3 + 2] = pixels[idx + 2];
        }
    }
    return data;
}
