import { describe, it, expect, beforeEach, vi } from 'vitest';
import { inspectBlock } from '../../src/lib/inspection.js';
import { appState, ViewMode } from '../../src/lib/state.svelte.js';
import { inspectBlockData } from '../../src/lib/wasm-bridge.js';

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
            <input id="inspQualitySlider" value="75" />
            <canvas id="processedCanvas"></canvas>
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
        // channelIndex 0 for Y, quality 75 from DOM mock
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

    it('handles RGB view mode and reads from processedCanvas', () => {
        appState.currentViewMode = ViewMode.RGB;
        // Mock getContext to return dummy getImageData
        const canvas = document.getElementById('processedCanvas');
        canvas.getContext = vi.fn(() => ({
            getImageData: vi.fn(() => ({
                data: new Uint8ClampedArray(64 * 4),
                width: 8,
                height: 8
            }))
        }));

        inspectBlock(0, 0);

        // renderGrid should be called with intensity and isRGB=true
        expect(renderGrid).toHaveBeenCalledWith('gridOriginal', expect.any(Object), 'intensity', 'original', true);
        expect(renderGrid).toHaveBeenCalledWith('gridReconstructed', expect.any(Object), 'intensity', 'reconstructed', true);
    });

    it('sets correct classes for stats based on MSE and BPP', () => {
        // Since we read from HEAPU8, if it's all 0, MSE will be 0, BPP will be small
        inspectBlock(0, 0);
        const mseSpan = document.getElementById('statMSE');
        expect(mseSpan.classList.contains('stat-good')).toBe(true);
        expect(mseSpan.innerText).toBe('0.00');
    });
});
