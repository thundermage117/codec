// Browser integration tests for inspection.js.
// These run in real Chromium via Playwright (@vitest/browser).
// Module is mocked via tests/setup/browser.setup.js (set on window before tests run).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { appState, ViewMode } from '../../src/lib/state.svelte.js';
import { inspectBlock } from '../../src/lib/inspection.js';

// ─── DOM Fixture ─────────────────────────────────────────────────────────
// Build the minimal DOM structure that inspectBlock() and renderGrid() need.

const REQUIRED_DIVS = [
    'inspectorContent', 'inspectorPlaceholder', 'blockCoords',
    'qTableType', 'qTableType2',
    'gridOriginal', 'gridDCT', 'gridQuantized', 'gridQuantized2',
    'gridDequantized', 'gridReconstructed', 'gridQuantTable', 'gridError',
    'statMSE', 'statPeakError', 'statZeros', 'statCompression',
    'lossMeterContainer', 'basisPopover',
    'basisCoord', 'basisFreqLabel', 'basisValue', 'basisQuantized',
    'basisDivisor',
];

const REQUIRED_CANVASES = ['processedCanvas', 'basisCanvas', 'contributionCanvas'];
const REQUIRED_SLIDERS = ['inspQualitySlider', 'qualitySlider'];

function buildDOM() {
    REQUIRED_DIVS.forEach((id) => {
        if (!document.getElementById(id)) {
            const el = document.createElement('div');
            el.id = id;
            document.body.appendChild(el);
        }
    });
    REQUIRED_CANVASES.forEach((id) => {
        if (!document.getElementById(id)) {
            const el = document.createElement('canvas');
            el.id = id;
            el.width = 64;
            el.height = 64;
            document.body.appendChild(el);
        }
    });
    REQUIRED_SLIDERS.forEach((id) => {
        if (!document.getElementById(id)) {
            const el = document.createElement('input');
            el.type = 'range';
            el.id = id;
            el.value = '50';
            document.body.appendChild(el);
        }
    });

    document.getElementById('inspectorContent').style.display = 'none';
    document.getElementById('inspectorPlaceholder').style.display = 'block';
}

function teardownDOM() {
    [...REQUIRED_DIVS, ...REQUIRED_CANVASES, ...REQUIRED_SLIDERS].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.remove();
    });
    // Remove any dynamically created tooltip
    document.querySelectorAll('.grid-cell-tooltip').forEach((el) => el.remove());
}

// ─── Heap Data Setup ──────────────────────────────────────────────────────
// inspectBlockData() returns ptr=256. inspection.js reads 5 grids of 64
// float64 values starting at ptr. Grid i starts at ptr + i*64*8 bytes.
//
// Test data:
//   originalData  : all 128  (mid-grey pixels)
//   dctData       : DC=512, rest=0
//   qtData        : all 16   (quantization divisors)
//   quantData     : DC=32, rest=0  (512/16 = 32)
//   reconData     : all 120  (8-unit error from original)
//
// Expected stats:
//   error[i]      = 128 - 120 = 8 for all i
//   MSE           = 64 / 64 = 64   → displayed as "64.00"
//   peakError     = 8              → displayed as "8.0"
//   zeroCount     = 63 (quantData[0]=32 is non-zero)  → "63/64"
//   zeroPercent   = round(63/64 * 100) = 98           → "98%"

function fillHeap() {
    const heap = window.Module.HEAPU8;
    heap.fill(0);
    const view = new DataView(heap.buffer);
    const basePtr = 256;
    const gridsData = [
        new Array(64).fill(128),   // originalData
        (() => { const g = new Array(64).fill(0); g[0] = 512; return g; })(), // dctData
        new Array(64).fill(16),    // qtData
        (() => { const g = new Array(64).fill(0); g[0] = 32; return g; })(),  // quantData
        new Array(64).fill(120),   // reconData
    ];
    gridsData.forEach((grid, gi) => {
        grid.forEach((val, i) => {
            view.setFloat64(basePtr + gi * 64 * 8 + i * 8, val, true);
        });
    });
}

beforeEach(() => {
    buildDOM();
    fillHeap();

    // Set state for non-RGB mode to avoid processedCanvas.getImageData path
    appState.currentViewMode = ViewMode.Y;
    appState.currentCsMode = 444;
    appState.appMode = 'inspector';
    appState.wasmReady = true;
    appState.inspectedBlock = null;
    appState.originalImageData = null;
});

afterEach(() => {
    teardownDOM();
});

// ─── DOM Visibility ───────────────────────────────────────────────────────

describe('inspectBlock - DOM visibility', () => {
    it('shows inspectorContent and hides inspectorPlaceholder', () => {
        inspectBlock(0, 0);
        expect(document.getElementById('inspectorContent').style.display).toBe('block');
        expect(document.getElementById('inspectorPlaceholder').style.display).toBe('none');
    });

    it('does not clear appState.inspectedBlock when called with coordinates', () => {
        appState.inspectedBlock = { x: 2, y: 7 };
        inspectBlock(2, 7);
        expect(appState.inspectedBlock).toEqual({ x: 2, y: 7 });
    });

    it('updates blockCoords text with pixel and block coordinates', () => {
        inspectBlock(3, 5);
        const text = document.getElementById('blockCoords').innerText;
        // Format: "${blockX*8}, ${blockY*8} (Block ${blockX},${blockY})"
        expect(text).toContain('24, 40');
        expect(text).toContain('3,5');
    });
});

// ─── Q-Table Label ────────────────────────────────────────────────────────

describe('inspectBlock - qTableType label', () => {
    it('shows "Luma" when currentViewMode is Y', () => {
        appState.currentViewMode = ViewMode.Y; // channelIndex = 0
        inspectBlock(0, 0);
        expect(document.getElementById('qTableType').innerText).toBe('Luma');
        expect(document.getElementById('qTableType2').innerText).toBe('Luma');
    });

    it('shows "Chroma" when currentViewMode is Cr', () => {
        appState.currentViewMode = ViewMode.Cr; // channelIndex = 1
        inspectBlock(0, 0);
        expect(document.getElementById('qTableType').innerText).toBe('Chroma');
    });

    it('shows "Chroma" when currentViewMode is Cb', () => {
        appState.currentViewMode = ViewMode.Cb; // channelIndex = 2
        inspectBlock(0, 0);
        expect(document.getElementById('qTableType').innerText).toBe('Chroma');
    });
});

// ─── Grid Rendering ───────────────────────────────────────────────────────

describe('inspectBlock - grid rendering', () => {
    it('populates gridOriginal with exactly 64 child elements', () => {
        inspectBlock(0, 0);
        expect(document.getElementById('gridOriginal').children).toHaveLength(64);
    });

    it('populates gridDCT with exactly 64 child elements', () => {
        inspectBlock(0, 0);
        expect(document.getElementById('gridDCT').children).toHaveLength(64);
    });

    it('populates gridReconstructed with exactly 64 child elements', () => {
        inspectBlock(0, 0);
        expect(document.getElementById('gridReconstructed').children).toHaveLength(64);
    });

    it('each cell has class grid-cell', () => {
        inspectBlock(0, 0);
        const cells = document.getElementById('gridDCT').children;
        for (const cell of cells) {
            expect(cell.classList.contains('grid-cell')).toBe(true);
        }
    });

    it('each cell has data-row and data-col attributes', () => {
        inspectBlock(0, 0);
        const grid = document.getElementById('gridDCT');
        expect(grid.children[0].dataset.row).toBe('0');
        expect(grid.children[0].dataset.col).toBe('0');
        expect(grid.children[63].dataset.row).toBe('7');
        expect(grid.children[63].dataset.col).toBe('7');
    });

    it('data-row and data-col traverse in row-major order', () => {
        inspectBlock(0, 0);
        const grid = document.getElementById('gridDCT');
        // index 8 = row 1, col 0
        expect(grid.children[8].dataset.row).toBe('1');
        expect(grid.children[8].dataset.col).toBe('0');
    });

    it('DCT cells with |val| < 0.5 get class cell-zero', () => {
        // dctData[0]=512 (non-zero), dctData[1..63]=0 (zero)
        inspectBlock(0, 0);
        const grid = document.getElementById('gridDCT');
        expect(grid.children[0].classList.contains('cell-zero')).toBe(false);
        expect(grid.children[1].classList.contains('cell-zero')).toBe(true);
        expect(grid.children[63].classList.contains('cell-zero')).toBe(true);
    });
});

// ─── Statistics ───────────────────────────────────────────────────────────

describe('inspectBlock - statistics', () => {
    it('statMSE shows correct value (64.00 for error=8 per pixel)', () => {
        inspectBlock(0, 0);
        expect(document.getElementById('statMSE').innerText).toBe('64.00');
    });

    it('statPeakError shows correct value (8.0 for error=8)', () => {
        inspectBlock(0, 0);
        expect(document.getElementById('statPeakError').innerText).toBe('8.0');
    });

    it('statZeros shows correct zero count (63/64)', () => {
        // quantData[0]=32 non-zero, rest=0 → 63 zeros
        inspectBlock(0, 0);
        expect(document.getElementById('statZeros').innerText).toBe('63/64');
    });

    it('statCompression shows correct percentage (98%)', () => {
        // 63/64 ≈ 98%
        inspectBlock(0, 0);
        expect(document.getElementById('statCompression').innerText).toBe('98%');
    });
});

// ─── Cross-Grid Highlighting ──────────────────────────────────────────────

describe('inspectBlock - cross-grid highlighting', () => {
    it('mouseenter on a cell highlights the same index in all grids', () => {
        inspectBlock(0, 0);
        const dctGrid = document.getElementById('gridDCT');
        const origGrid = document.getElementById('gridOriginal');

        // Hover over cell at index 5 (row=0, col=5) in the DCT grid
        dctGrid.children[5].dispatchEvent(
            new MouseEvent('mousemove', { bubbles: true, clientX: 100, clientY: 100 })
        );

        expect(origGrid.children[5].classList.contains('cell-highlight')).toBe(true);
    });

    it('mouseleave on the grid container removes all highlights', () => {
        inspectBlock(0, 0);
        const dctGrid = document.getElementById('gridDCT');
        const origGrid = document.getElementById('gridOriginal');

        dctGrid.children[5].dispatchEvent(
            new MouseEvent('mouseenter', { bubbles: true })
        );
        dctGrid.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));

        expect(origGrid.children[5].classList.contains('cell-highlight')).toBe(false);
    });
});

// ─── Re-inspection ────────────────────────────────────────────────────────

describe('inspectBlock - multiple calls', () => {
    it('updates blockCoords when called with different coordinates', () => {
        inspectBlock(1, 2);
        expect(document.getElementById('blockCoords').innerText).toContain('1,2');

        inspectBlock(4, 6);
        expect(document.getElementById('blockCoords').innerText).toContain('4,6');
    });

    it('re-renders grids on each call (grid is cleared and rebuilt)', () => {
        inspectBlock(0, 0);
        const cellsBefore = document.getElementById('gridDCT').children.length;
        inspectBlock(1, 1);
        const cellsAfter = document.getElementById('gridDCT').children.length;
        expect(cellsBefore).toBe(64);
        expect(cellsAfter).toBe(64);
    });
});
