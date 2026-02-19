import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { appState } from '../../src/lib/state.svelte.js';
import { computeSuggestedBlocks } from '../../src/lib/suggested-blocks.js';

// ─── Helpers ────────────────────────────────────────────────────────────

function makeImageData(width, height, fillRgba = [128, 128, 128, 255]) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
        data[i] = fillRgba[0];
        data[i + 1] = fillRgba[1];
        data[i + 2] = fillRgba[2];
        data[i + 3] = fillRgba[3];
    }
    return { data, width, height };
}

function makeCheckerboard(width, height) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const val = (x + y) % 2 === 0 ? 255 : 0;
            data[idx] = val;
            data[idx + 1] = val;
            data[idx + 2] = val;
            data[idx + 3] = 255;
        }
    }
    return { data, width, height };
}

// ─── DOM fixture ────────────────────────────────────────────────────────
// computeSuggestedBlocks reads from document.getElementById('processedCanvas')
// via a try/catch, so we insert and remove a canvas element around each test.

let processedCanvas;
beforeEach(() => {
    processedCanvas = document.createElement('canvas');
    processedCanvas.id = 'processedCanvas';
    processedCanvas.width = 64;
    processedCanvas.height = 64;
    document.body.appendChild(processedCanvas);

    // Reset state
    appState.originalImageData = null;
    appState.imgWidth = 0;
    appState.imgHeight = 0;
    appState.suggestedBlocks = [];
});

afterEach(() => {
    if (processedCanvas && processedCanvas.parentNode) {
        document.body.removeChild(processedCanvas);
    }
});

// ─── computeSuggestedBlocks ─────────────────────────────────────────────

describe('computeSuggestedBlocks - null / empty image', () => {
    it('sets suggestedBlocks to [] when originalImageData is null', () => {
        appState.originalImageData = null;
        computeSuggestedBlocks();
        expect(appState.suggestedBlocks).toEqual([]);
    });

    it('sets suggestedBlocks to [] when image is too small for an 8×8 block', () => {
        appState.originalImageData = makeImageData(7, 7);
        appState.imgWidth = 7;
        appState.imgHeight = 7;
        computeSuggestedBlocks();
        expect(appState.suggestedBlocks).toEqual([]);
    });
});

describe('computeSuggestedBlocks - valid image', () => {
    it('produces results for a 64×64 image', () => {
        appState.originalImageData = makeImageData(64, 64);
        appState.imgWidth = 64;
        appState.imgHeight = 64;
        computeSuggestedBlocks();
        expect(appState.suggestedBlocks.length).toBeGreaterThan(0);
    });

    it('returns at most 6 suggestions (2 per category × 3 categories)', () => {
        appState.originalImageData = makeImageData(64, 64);
        appState.imgWidth = 64;
        appState.imgHeight = 64;
        computeSuggestedBlocks();
        expect(appState.suggestedBlocks.length).toBeLessThanOrEqual(6);
    });

    it('each suggestion has required fields: x, y, label, icon, score, category', () => {
        appState.originalImageData = makeImageData(64, 64);
        appState.imgWidth = 64;
        appState.imgHeight = 64;
        computeSuggestedBlocks();
        for (const block of appState.suggestedBlocks) {
            expect(block).toHaveProperty('x');
            expect(block).toHaveProperty('y');
            expect(block).toHaveProperty('label');
            expect(block).toHaveProperty('icon');
            expect(block).toHaveProperty('score');
            expect(block).toHaveProperty('category');
        }
    });

    it('block coordinates are non-negative integers', () => {
        appState.originalImageData = makeImageData(64, 64);
        appState.imgWidth = 64;
        appState.imgHeight = 64;
        computeSuggestedBlocks();
        for (const block of appState.suggestedBlocks) {
            expect(block.x).toBeGreaterThanOrEqual(0);
            expect(block.y).toBeGreaterThanOrEqual(0);
            expect(Number.isInteger(block.x)).toBe(true);
            expect(Number.isInteger(block.y)).toBe(true);
        }
    });

    it('categories are within the known set', () => {
        appState.originalImageData = makeImageData(64, 64);
        appState.imgWidth = 64;
        appState.imgHeight = 64;
        computeSuggestedBlocks();
        const valid = new Set(['edge', 'texture', 'smooth']);
        for (const block of appState.suggestedBlocks) {
            expect(valid.has(block.category)).toBe(true);
        }
    });

    it('no duplicate (x, y) pairs in results', () => {
        appState.originalImageData = makeImageData(64, 64);
        appState.imgWidth = 64;
        appState.imgHeight = 64;
        computeSuggestedBlocks();
        const keys = appState.suggestedBlocks.map((b) => `${b.x},${b.y}`);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('replaces appState.suggestedBlocks on every call', () => {
        appState.originalImageData = makeImageData(64, 64);
        appState.imgWidth = 64;
        appState.imgHeight = 64;
        computeSuggestedBlocks();
        const first = appState.suggestedBlocks;
        computeSuggestedBlocks();
        // Should be a fresh array each call
        expect(appState.suggestedBlocks).not.toBe(first);
    });
});

describe('computeSuggestedBlocks - scoring', () => {
    it('checkerboard image produces at least one edge-category block', () => {
        appState.originalImageData = makeCheckerboard(64, 64);
        appState.imgWidth = 64;
        appState.imgHeight = 64;
        computeSuggestedBlocks();
        const edgeBlocks = appState.suggestedBlocks.filter((b) => b.category === 'edge');
        expect(edgeBlocks.length).toBeGreaterThan(0);
    });

    it('uniform image produces at least one smooth-category block', () => {
        // Zero variance → smooth score is 1/(1+0) = 1 (maximum)
        appState.originalImageData = makeImageData(64, 64, [128, 128, 128, 255]);
        appState.imgWidth = 64;
        appState.imgHeight = 64;
        computeSuggestedBlocks();
        const smoothBlocks = appState.suggestedBlocks.filter((b) => b.category === 'smooth');
        expect(smoothBlocks.length).toBeGreaterThan(0);
    });

    it('smooth score is always in (0, 1] (inverse variance formula)', () => {
        // smooth = 1/(1 + variance), variance >= 0, so 0 < smooth <= 1
        appState.originalImageData = makeCheckerboard(64, 64);
        appState.imgWidth = 64;
        appState.imgHeight = 64;
        computeSuggestedBlocks();
        const smoothBlocks = appState.suggestedBlocks.filter((b) => b.category === 'smooth');
        for (const b of smoothBlocks) {
            expect(b.score).toBeGreaterThan(0);
            expect(b.score).toBeLessThanOrEqual(1);
        }
    });

    it('edge score is non-negative', () => {
        appState.originalImageData = makeCheckerboard(64, 64);
        appState.imgWidth = 64;
        appState.imgHeight = 64;
        computeSuggestedBlocks();
        const edgeBlocks = appState.suggestedBlocks.filter((b) => b.category === 'edge');
        for (const b of edgeBlocks) {
            expect(b.score).toBeGreaterThanOrEqual(0);
        }
    });
});
