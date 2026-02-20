import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { appState } from '../../src/lib/state.svelte.js';
import { computeSuggestedBlocks, renderBlockThumbnail } from '../../src/lib/suggested-blocks.js';

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

    it('texture score is non-negative', () => {
        appState.originalImageData = makeCheckerboard(64, 64);
        appState.imgWidth = 64;
        appState.imgHeight = 64;
        computeSuggestedBlocks();
        const textureBlocks = appState.suggestedBlocks.filter((b) => b.category === 'texture');
        for (const b of textureBlocks) {
            expect(b.score).toBeGreaterThanOrEqual(0);
        }
    });

    it('checkerboard produces at least one texture-category block', () => {
        // Checkerboard has high pixel variance → high texture score
        appState.originalImageData = makeCheckerboard(64, 64);
        appState.imgWidth = 64;
        appState.imgHeight = 64;
        computeSuggestedBlocks();
        expect(appState.suggestedBlocks.filter((b) => b.category === 'texture').length).toBeGreaterThan(0);
    });

    it('smooth score is exactly 1 for a uniform image (variance = 0)', () => {
        // variance = 0 → smooth = 1 / (1 + 0) = 1
        appState.originalImageData = makeImageData(64, 64, [200, 200, 200, 255]);
        appState.imgWidth = 64;
        appState.imgHeight = 64;
        computeSuggestedBlocks();
        for (const b of appState.suggestedBlocks.filter((b) => b.category === 'smooth')) {
            expect(b.score).toBe(1);
        }
    });

    it('each block has the correct label and icon for its category', () => {
        const expected = {
            edge:    { label: 'Edge',    icon: '🔷' },
            texture: { label: 'Texture', icon: '🔶' },
            smooth:  { label: 'Smooth',  icon: '🟢' },
        };
        appState.originalImageData = makeCheckerboard(64, 64);
        appState.imgWidth = 64;
        appState.imgHeight = 64;
        computeSuggestedBlocks();
        for (const b of appState.suggestedBlocks) {
            expect(b.label).toBe(expected[b.category].label);
            expect(b.icon).toBe(expected[b.category].icon);
        }
    });
});

// ─── computeSuggestedBlocks - edge cases ────────────────────────────────

describe('computeSuggestedBlocks - edge cases', () => {
    it('block coordinates stay within image bounds', () => {
        appState.originalImageData = makeImageData(64, 64);
        appState.imgWidth = 64;
        appState.imgHeight = 64;
        computeSuggestedBlocks();
        const blocksX = Math.floor(64 / 8);
        const blocksY = Math.floor(64 / 8);
        for (const b of appState.suggestedBlocks) {
            expect(b.x).toBeLessThan(blocksX);
            expect(b.y).toBeLessThan(blocksY);
        }
    });

    it('single-block 8x8 image results in only one unique block position', () => {
        appState.originalImageData = makeImageData(8, 8, [200, 100, 50, 255]);
        appState.imgWidth = 8;
        appState.imgHeight = 8;
        computeSuggestedBlocks();
        // All 3 categories pick the same single block → dedup leaves 1 result
        const keys = appState.suggestedBlocks.map((b) => `${b.x},${b.y}`);
        expect(new Set(keys).size).toBe(1);
        expect(appState.suggestedBlocks[0].x).toBe(0);
        expect(appState.suggestedBlocks[0].y).toBe(0);
    });

    it('large image (400×400) still returns at most 6 suggestions', () => {
        appState.originalImageData = makeCheckerboard(400, 400);
        appState.imgWidth = 400;
        appState.imgHeight = 400;
        computeSuggestedBlocks();
        expect(appState.suggestedBlocks.length).toBeLessThanOrEqual(6);
    });

    it('accepts explicit processedCanvas param without throwing', () => {
        appState.originalImageData = makeImageData(64, 64);
        appState.imgWidth = 64;
        appState.imgHeight = 64;
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        expect(() => computeSuggestedBlocks(canvas)).not.toThrow();
        expect(appState.suggestedBlocks.length).toBeGreaterThan(0);
    });

    it('null processedCanvas param produces results without error scoring', () => {
        appState.originalImageData = makeImageData(64, 64);
        appState.imgWidth = 64;
        appState.imgHeight = 64;
        computeSuggestedBlocks(null);
        expect(appState.suggestedBlocks.length).toBeGreaterThan(0);
    });

    it('16×16 image (4 blocks) returns at most 4 unique suggestions', () => {
        appState.originalImageData = makeCheckerboard(16, 16);
        appState.imgWidth = 16;
        appState.imgHeight = 16;
        computeSuggestedBlocks();
        const keys = appState.suggestedBlocks.map((b) => `${b.x},${b.y}`);
        expect(new Set(keys).size).toBe(keys.length); // no duplicates
        // At most 4 unique blocks exist in a 16×16 image
        expect(keys.length).toBeLessThanOrEqual(4);
    });
});

// ─── renderBlockThumbnail ────────────────────────────────────────────────

describe('renderBlockThumbnail', () => {
    it('returns early without throwing when canvas is null', () => {
        appState.originalImageData = makeImageData(64, 64);
        appState.imgWidth = 64;
        appState.imgHeight = 64;
        expect(() => renderBlockThumbnail(null, 0, 0)).not.toThrow();
    });

    it('returns early without throwing when originalImageData is null', () => {
        const canvas = document.createElement('canvas');
        appState.originalImageData = null;
        expect(() => renderBlockThumbnail(canvas, 0, 0)).not.toThrow();
    });

    it('sets canvas dimensions to 8×8', () => {
        const canvas = document.createElement('canvas');
        canvas.width = 100;
        canvas.height = 100;
        appState.originalImageData = makeImageData(64, 64);
        appState.imgWidth = 64;
        appState.imgHeight = 64;
        renderBlockThumbnail(canvas, 0, 0);
        expect(canvas.width).toBe(8);
        expect(canvas.height).toBe(8);
    });

    it('does not throw for blocks at non-zero positions', () => {
        const canvas = document.createElement('canvas');
        appState.originalImageData = makeImageData(64, 64);
        appState.imgWidth = 64;
        appState.imgHeight = 64;
        expect(() => renderBlockThumbnail(canvas, 3, 5)).not.toThrow();
    });

    it('copies correct pixel data for block (0,0)', () => {
        appState.originalImageData = makeImageData(64, 64, [10, 20, 30, 255]);
        appState.imgWidth = 64;
        appState.imgHeight = 64;

        let capturedImgData = null;
        const mockCanvas = {
            width: 0,
            height: 0,
            getContext: () => ({
                createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
                putImageData: (imgData) => { capturedImgData = imgData; },
            }),
        };

        renderBlockThumbnail(mockCanvas, 0, 0);

        expect(capturedImgData).not.toBeNull();
        // All 64 pixels in block (0,0) should map to [10, 20, 30, 255]
        for (let i = 0; i < 64; i++) {
            expect(capturedImgData.data[i * 4]).toBe(10);      // R
            expect(capturedImgData.data[i * 4 + 1]).toBe(20);  // G
            expect(capturedImgData.data[i * 4 + 2]).toBe(30);  // B
            expect(capturedImgData.data[i * 4 + 3]).toBe(255); // A
        }
    });

    it('copies correct pixels for a non-zero block position', () => {
        // Black image with block (2,1) (cols 16-23, rows 8-15) set to blue [0,0,200,255]
        const imageData = makeImageData(64, 64, [0, 0, 0, 255]);
        for (let y = 8; y < 16; y++) {
            for (let x = 16; x < 24; x++) {
                const idx = (y * 64 + x) * 4;
                imageData.data[idx + 2] = 200; // B
                imageData.data[idx + 3] = 255; // A
            }
        }
        appState.originalImageData = imageData;
        appState.imgWidth = 64;
        appState.imgHeight = 64;

        let capturedImgData = null;
        const mockCanvas = {
            width: 0,
            height: 0,
            getContext: () => ({
                createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
                putImageData: (imgData) => { capturedImgData = imgData; },
            }),
        };

        renderBlockThumbnail(mockCanvas, 2, 1); // bx=2, by=1

        expect(capturedImgData).not.toBeNull();
        for (let i = 0; i < 64; i++) {
            expect(capturedImgData.data[i * 4]).toBe(0);       // R
            expect(capturedImgData.data[i * 4 + 1]).toBe(0);   // G
            expect(capturedImgData.data[i * 4 + 2]).toBe(200); // B
            expect(capturedImgData.data[i * 4 + 3]).toBe(255); // A
        }
    });
});
