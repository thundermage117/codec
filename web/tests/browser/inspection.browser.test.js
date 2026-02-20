// Browser integration tests for inspection.js.
// These run in real Chromium via Playwright (@vitest/browser).
// Module is mocked via tests/setup/browser.setup.js (set on window before tests run).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { appState, ViewMode } from '../../src/lib/state.svelte.js';
import { inspectBlock } from '../../src/lib/inspection.js';

// ─── DOM Fixture ─────────────────────────────────────────────────────────
// Build the minimal DOM structure that inspectBlock() and renderGrid() need.

const REQUIRED_DIVS = [
    'blockCoords',
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
// Note: inspectorContent/inspectorPlaceholder visibility is owned by Svelte
// (style={appState.inspectedBlock ? ...} in InspectorMode.svelte). inspectBlock
// itself no longer touches those elements.

describe('inspectBlock - DOM visibility', () => {
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

// ─── Loss Meter ───────────────────────────────────────────────────────────

describe('inspectBlock - loss meter', () => {
    it('creates a .loss-meter element inside lossMeterContainer', () => {
        inspectBlock(0, 0);
        const container = document.getElementById('lossMeterContainer');
        expect(container.querySelector('.loss-meter')).not.toBeNull();
    });

    it('.loss-meter-value shows a percentage string', () => {
        inspectBlock(0, 0);
        const value = document.querySelector('.loss-meter-value');
        expect(value).not.toBeNull();
        expect(value.textContent).toMatch(/^\d+%$/);
    });

    it('shows 34% quality for the default test data (MSE=64)', () => {
        // MSE=64 → PSNR = 10*log10(255²/64) ≈ 30.07 dB
        // qualityPct = round((30.07 - 20) / 30 * 100) = round(33.57) = 34
        inspectBlock(0, 0);
        const value = document.querySelector('.loss-meter-value');
        expect(value.textContent).toBe('34%');
    });

    it('does not create duplicate .loss-meter elements on repeated calls', () => {
        inspectBlock(0, 0);
        inspectBlock(1, 1);
        const meters = document.getElementById('lossMeterContainer').querySelectorAll('.loss-meter');
        expect(meters.length).toBe(1);
    });
});

// ─── Stat CSS Classes ─────────────────────────────────────────────────────

// Fills heap with uniform error-per-pixel so we can control MSE / peakError.
// All quantData = 0 → zeroCount = 64 → compression = 100%.
function fillHeapWithError(errorPerPixel) {
    const heap = window.Module.HEAPU8;
    heap.fill(0);
    const view = new DataView(heap.buffer);
    const basePtr = 256;
    const original = 128;
    const recon = original - errorPerPixel;
    [
        new Array(64).fill(original), // originalData
        new Array(64).fill(0),        // dctData
        new Array(64).fill(16),       // qtData
        new Array(64).fill(0),        // quantData  (all zero → zeroCount=64)
        new Array(64).fill(recon),    // reconData
    ].forEach((grid, gi) => {
        grid.forEach((val, i) => {
            view.setFloat64(basePtr + gi * 64 * 8 + i * 8, val, true);
        });
    });
}

describe('inspectBlock - stat CSS classes', () => {
    it('MSE < 5 gives stat-good class on statMSE', () => {
        // error=1 per pixel → MSE = 1
        fillHeapWithError(1);
        inspectBlock(0, 0);
        expect(document.getElementById('statMSE').classList.contains('stat-good')).toBe(true);
    });

    it('5 ≤ MSE < 20 gives stat-moderate class on statMSE', () => {
        // error=3 per pixel → MSE = 9
        fillHeapWithError(3);
        inspectBlock(0, 0);
        expect(document.getElementById('statMSE').classList.contains('stat-moderate')).toBe(true);
    });

    it('MSE ≥ 20 gives stat-poor class on statMSE', () => {
        // default fillHeap(): error=8 → MSE=64
        inspectBlock(0, 0);
        expect(document.getElementById('statMSE').classList.contains('stat-poor')).toBe(true);
    });

    it('peakError < 10 gives stat-good class on statPeakError', () => {
        // default fillHeap(): peakError=8 < 10
        inspectBlock(0, 0);
        expect(document.getElementById('statPeakError').classList.contains('stat-good')).toBe(true);
    });

    it('compression > 70% gives stat-good class on statCompression', () => {
        // fillHeapWithError(1): quantData all 0 → zeroCount=64 → 100%
        fillHeapWithError(1);
        inspectBlock(0, 0);
        expect(document.getElementById('statCompression').classList.contains('stat-good')).toBe(true);
    });
});

// ─── Null WASM Pointer ────────────────────────────────────────────────────

describe('inspectBlock - null WASM pointer', () => {
    it('leaves grids empty when WASM returns 0', () => {
        const orig = window.Module._inspect_block_data;
        window.Module._inspect_block_data = () => 0;

        inspectBlock(0, 0);

        expect(document.getElementById('gridDCT').children.length).toBe(0);
        expect(document.getElementById('gridOriginal').children.length).toBe(0);

        window.Module._inspect_block_data = orig;
    });
});

// ─── Quality Slider Selection ─────────────────────────────────────────────

describe('inspectBlock - quality slider selection', () => {
    function spyOnQuality(callback) {
        const orig = window.Module._inspect_block_data;
        let captured = null;
        window.Module._inspect_block_data = (_bx, _by, _ch, q) => { captured = q; return 256; };
        callback();
        window.Module._inspect_block_data = orig;
        return captured;
    }

    it('uses inspQualitySlider value in inspector mode', () => {
        document.getElementById('inspQualitySlider').value = '75';
        appState.appMode = 'inspector';
        const q = spyOnQuality(() => inspectBlock(0, 0));
        expect(q).toBe(75);
    });

    it('uses qualitySlider value in viewer mode', () => {
        document.getElementById('qualitySlider').value = '30';
        appState.appMode = 'viewer';
        const q = spyOnQuality(() => inspectBlock(0, 0));
        expect(q).toBe(30);
    });

    it('falls back to appState.quality when no slider element exists', () => {
        // Remove both sliders temporarily
        const insp = document.getElementById('inspQualitySlider');
        const qual = document.getElementById('qualitySlider');
        insp.remove();
        qual.remove();

        appState.quality = 42;
        appState.appMode = 'viewer';
        const q = spyOnQuality(() => inspectBlock(0, 0));
        expect(q).toBe(42);

        document.body.appendChild(insp);
        document.body.appendChild(qual);
    });
});

// ─── Grid Value Accuracy ──────────────────────────────────────────────────

describe('inspectBlock - derived grid values', () => {
    it('gridError cell[0] shows "8.0" (original 128 − recon 120 = 8)', () => {
        inspectBlock(0, 0);
        const cell = document.getElementById('gridError').children[0];
        expect(cell.innerText).toBe('8.0');
    });

    it('gridError cells[1..63] show "8.0" (uniform error across block)', () => {
        inspectBlock(0, 0);
        const cells = document.getElementById('gridError').children;
        for (let i = 1; i < 64; i++) {
            expect(cells[i].innerText).toBe('8.0');
        }
    });

    it('gridDequantized cell[0] shows "512.0" (quantData[0]=32 × qtData=16)', () => {
        inspectBlock(0, 0);
        const cell = document.getElementById('gridDequantized').children[0];
        expect(cell.innerText).toBe('512.0');
    });

    it('gridDequantized cells[1..63] show "0" (quantData[1..63]=0)', () => {
        inspectBlock(0, 0);
        const cells = document.getElementById('gridDequantized').children;
        for (let i = 1; i < 64; i++) {
            expect(cells[i].innerText).toBe('0');
        }
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
