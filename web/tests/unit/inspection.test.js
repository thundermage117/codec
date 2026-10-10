import { describe, it, expect, beforeEach, vi } from 'vitest';
import { inspectBlock, previousBlockInScan } from '../../src/lib/inspection.js';
import { appState, ViewMode } from '../../src/lib/state.svelte.js';
import { inspectBlockData, getProcessedRgba } from '../../src/lib/wasm-bridge.js';

// Mock dependencies
vi.mock('../../src/lib/grid-renderer.js', () => ({
    renderGrid: vi.fn(),
    renderLossMeter: vi.fn(),
    renderZigzagArray: vi.fn(),
    renderEntropySummary: vi.fn(),
    stopReconstructionAnimation: vi.fn(),
}));

vi.mock('../../src/lib/basis-popover.js', () => ({
    hideBasisPopover: vi.fn(),
    setCachedGridData: vi.fn(),
}));

vi.mock('../../src/lib/wasm-bridge.js', () => ({
    inspectBlockData: vi.fn(() => 256),
    getProcessedRgba: vi.fn(() => null),
}));

// Module.HEAPU8 is already mocked in tests/setup/unit.setup.js

import { renderGrid, renderLossMeter, renderZigzagArray, renderEntropySummary } from '../../src/lib/grid-renderer.js';
import { hideBasisPopover, setCachedGridData } from '../../src/lib/basis-popover.js';

describe('inspection.js - inspectBlock', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <span id="blockCoords"></span>
            <span id="qTableType"></span>
            <span id="qTableType2"></span>
            <div class="stat-item"><span id="statMSE"></span></div>
            <div class="stat-item"><span id="statPeakError"></span></div>
            <div class="stat-item"><span id="statZeros"></span></div>
            <div class="stat-item"><span id="statCompression"></span></div>
            <div class="stat-item"><span id="statEstBits"></span></div>
            <div class="stat-item"><span id="statBpp"></span></div>
        `;

        vi.clearAllMocks();

        // Reset state
        appState.currentViewMode = ViewMode.Y;
        appState.appMode = 'inspector';
        appState.quality = 75;
        appState.originalImageData = {
            data: new Uint8ClampedArray(400 * 4), // enough for 10x10 RGB
            width: 10,
            height: 10
        };

        // Reset Mocked function return values
        vi.mocked(inspectBlockData).mockReturnValue(256);
    });

    it('sets block coordinates text', () => {
        inspectBlock(1, 2);
        expect(document.getElementById('blockCoords').innerText).toBe('8, 16 (Block 1,2)');
    });

    it('sets Luma label for Y view mode', () => {
        appState.currentViewMode = ViewMode.Y;
        inspectBlock(0, 0);
        expect(document.getElementById('qTableType').innerText).toBe('Luma');
        expect(document.getElementById('qTableType2').innerText).toBe('Luma');
    });

    it('sets Chroma label for Cb view mode', () => {
        appState.currentViewMode = ViewMode.Cb;
        inspectBlock(0, 0);
        expect(document.getElementById('qTableType').innerText).toBe('Chroma');
    });

    it('calls inspectBlockData with correct args', () => {
        inspectBlock(3, 4);
        // channelIndex 0 for Y, quality 75 from appState
        expect(inspectBlockData).toHaveBeenCalledWith(3, 4, 0, 75);
    });

    it('calls setCachedGridData and render methods', () => {
        inspectBlock(0, 0);
        expect(hideBasisPopover).toHaveBeenCalled();
        expect(setCachedGridData).toHaveBeenCalled();
        expect(renderGrid).toHaveBeenCalledTimes(9); // 9 grids updated
        expect(renderLossMeter).toHaveBeenCalled();
        expect(renderZigzagArray).toHaveBeenCalled();
        expect(renderEntropySummary).toHaveBeenCalled();
    });

    it('handles missing ptr from inspectBlockData', () => {
        vi.mocked(inspectBlockData).mockReturnValueOnce(0);

        inspectBlock(0, 0);
        // Grid rendering should be aborted if ptr is 0
        expect(renderGrid).not.toHaveBeenCalled();
    });

    it('RGB mode reads the reconstructed block from WASM, not a canvas', () => {
        appState.currentViewMode = ViewMode.RGB;
        appState.imgWidth = 16;
        appState.imgHeight = 16;
        appState.originalImageData = { data: new Uint8ClampedArray(16 * 16 * 4).fill(10), width: 16, height: 16 };
        const recon = new Uint8ClampedArray(16 * 16 * 4);
        // Mark pixel (8, 0) — the first pixel of block (1, 0) — in the reconstruction.
        recon[(0 * 16 + 8) * 4] = 200;
        vi.mocked(getProcessedRgba).mockReturnValueOnce(recon);

        inspectBlock(1, 0);

        expect(getProcessedRgba).toHaveBeenCalled();
        const reconCall = vi.mocked(renderGrid).mock.calls.find(c => c[0] === 'gridReconstructed');
        expect(reconCall[4]).toBe(true);
        expect(reconCall[1][0]).toBe(200); // R of the block's first pixel
    });

    it('pads partial edge blocks by replication in RGB mode', () => {
        appState.currentViewMode = ViewMode.RGB;
        appState.imgWidth = 12;
        appState.imgHeight = 8;
        const data = new Uint8ClampedArray(12 * 8 * 4);
        for (let x = 0; x < 12; x++) data[x * 4] = x * 10; // R ramp along row 0
        appState.originalImageData = { data, width: 12, height: 8 };

        inspectBlock(1, 0); // covers x = 8..11, then replicates x = 11

        const origCall = vi.mocked(renderGrid).mock.calls.find(c => c[0] === 'gridOriginal');
        const rowR = Array.from({ length: 8 }, (_, i) => origCall[1][i * 3]);
        expect(rowR).toEqual([80, 90, 100, 110, 110, 110, 110, 110]);
    });

    it('sets correct classes for stats based on MSE and BPP', () => {
        // Since we read from HEAPU8, if it's all 0, MSE will be 0, BPP will be small
        inspectBlock(0, 0);
        const mseSpan = document.getElementById('statMSE');
        expect(mseSpan.classList.contains('stat-good')).toBe(true);
        expect(mseSpan.innerText).toBe('0.00');
    });
});

describe('previousBlockInScan', () => {
    beforeEach(() => {
        appState.imgWidth = 100; // 13 luma blocks per row; 50 px chroma → 7 blocks at 4:2:x
        appState.imgHeight = 64;
        appState.currentCsMode = 444;
    });

    it('steps left within a row and wraps to the end of the previous row', () => {
        expect(previousBlockInScan(3, 2, 0)).toEqual({ x: 2, y: 2 });
        expect(previousBlockInScan(0, 2, 0)).toEqual({ x: 12, y: 1 });
        expect(previousBlockInScan(0, 0, 0)).toBeNull();
    });

    it('uses the coarser chroma grid at 4:2:0', () => {
        appState.currentCsMode = 420;
        // Luma-grid block (5, 3) is chroma block (2, 1); previous is chroma (1, 1).
        expect(previousBlockInScan(5, 3, 1)).toEqual({ x: 2, y: 2 });
        // Chroma block (0, 1) wraps to chroma (6, 0).
        expect(previousBlockInScan(1, 2, 2)).toEqual({ x: 12, y: 0 });
        expect(previousBlockInScan(1, 1, 1)).toBeNull();
    });

    it('keeps luma on its own grid regardless of subsampling', () => {
        appState.currentCsMode = 420;
        expect(previousBlockInScan(5, 3, 0)).toEqual({ x: 4, y: 3 });
    });
});

describe('inspectBlock - DC prediction', () => {
    it('reads the previous block before the current one', () => {
        appState.currentViewMode = ViewMode.Y;
        appState.imgWidth = 64;
        appState.imgHeight = 64;
        vi.mocked(inspectBlockData).mockClear();
        inspectBlock(2, 1);
        const calls = vi.mocked(inspectBlockData).mock.calls.map(c => [c[0], c[1]]);
        expect(calls).toEqual([[1, 1], [2, 1]]);
    });
});
