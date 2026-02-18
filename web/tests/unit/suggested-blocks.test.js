import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { state } from '../../public/js/state.js';
import { computeSuggestedBlocks, renderSuggestedBlocks } from '../../public/js/suggested-blocks.js';

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
    state.originalImageData = null;
    state.imgWidth = 0;
    state.imgHeight = 0;
    state.suggestedBlocks = [];
});

afterEach(() => {
    if (processedCanvas && processedCanvas.parentNode) {
        document.body.removeChild(processedCanvas);
    }
});

// ─── computeSuggestedBlocks ─────────────────────────────────────────────

describe('computeSuggestedBlocks - null / empty image', () => {
    it('sets suggestedBlocks to [] when originalImageData is null', () => {
        state.originalImageData = null;
        computeSuggestedBlocks();
        expect(state.suggestedBlocks).toEqual([]);
    });

    it('sets suggestedBlocks to [] when image is too small for an 8×8 block', () => {
        state.originalImageData = makeImageData(7, 7);
        state.imgWidth = 7;
        state.imgHeight = 7;
        computeSuggestedBlocks();
        expect(state.suggestedBlocks).toEqual([]);
    });
});

describe('computeSuggestedBlocks - valid image', () => {
    it('produces results for a 64×64 image', () => {
        state.originalImageData = makeImageData(64, 64);
        state.imgWidth = 64;
        state.imgHeight = 64;
        computeSuggestedBlocks();
        expect(state.suggestedBlocks.length).toBeGreaterThan(0);
    });

    it('returns at most 6 suggestions (2 per category × 3 categories)', () => {
        state.originalImageData = makeImageData(64, 64);
        state.imgWidth = 64;
        state.imgHeight = 64;
        computeSuggestedBlocks();
        expect(state.suggestedBlocks.length).toBeLessThanOrEqual(6);
    });

    it('each suggestion has required fields: x, y, label, icon, score, category', () => {
        state.originalImageData = makeImageData(64, 64);
        state.imgWidth = 64;
        state.imgHeight = 64;
        computeSuggestedBlocks();
        for (const block of state.suggestedBlocks) {
            expect(block).toHaveProperty('x');
            expect(block).toHaveProperty('y');
            expect(block).toHaveProperty('label');
            expect(block).toHaveProperty('icon');
            expect(block).toHaveProperty('score');
            expect(block).toHaveProperty('category');
        }
    });

    it('block coordinates are non-negative integers', () => {
        state.originalImageData = makeImageData(64, 64);
        state.imgWidth = 64;
        state.imgHeight = 64;
        computeSuggestedBlocks();
        for (const block of state.suggestedBlocks) {
            expect(block.x).toBeGreaterThanOrEqual(0);
            expect(block.y).toBeGreaterThanOrEqual(0);
            expect(Number.isInteger(block.x)).toBe(true);
            expect(Number.isInteger(block.y)).toBe(true);
        }
    });

    it('categories are within the known set', () => {
        state.originalImageData = makeImageData(64, 64);
        state.imgWidth = 64;
        state.imgHeight = 64;
        computeSuggestedBlocks();
        const valid = new Set(['edge', 'texture', 'smooth']);
        for (const block of state.suggestedBlocks) {
            expect(valid.has(block.category)).toBe(true);
        }
    });

    it('no duplicate (x, y) pairs in results', () => {
        state.originalImageData = makeImageData(64, 64);
        state.imgWidth = 64;
        state.imgHeight = 64;
        computeSuggestedBlocks();
        const keys = state.suggestedBlocks.map((b) => `${b.x},${b.y}`);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('replaces state.suggestedBlocks on every call', () => {
        state.originalImageData = makeImageData(64, 64);
        state.imgWidth = 64;
        state.imgHeight = 64;
        computeSuggestedBlocks();
        const first = state.suggestedBlocks;
        computeSuggestedBlocks();
        // Should be a fresh array each call
        expect(state.suggestedBlocks).not.toBe(first);
    });
});

describe('computeSuggestedBlocks - scoring', () => {
    it('checkerboard image produces at least one edge-category block', () => {
        state.originalImageData = makeCheckerboard(64, 64);
        state.imgWidth = 64;
        state.imgHeight = 64;
        computeSuggestedBlocks();
        const edgeBlocks = state.suggestedBlocks.filter((b) => b.category === 'edge');
        expect(edgeBlocks.length).toBeGreaterThan(0);
    });

    it('uniform image produces at least one smooth-category block', () => {
        // Zero variance → smooth score is 1/(1+0) = 1 (maximum)
        state.originalImageData = makeImageData(64, 64, [128, 128, 128, 255]);
        state.imgWidth = 64;
        state.imgHeight = 64;
        computeSuggestedBlocks();
        const smoothBlocks = state.suggestedBlocks.filter((b) => b.category === 'smooth');
        expect(smoothBlocks.length).toBeGreaterThan(0);
    });

    it('smooth score is always in (0, 1] (inverse variance formula)', () => {
        // smooth = 1/(1 + variance), variance >= 0, so 0 < smooth <= 1
        state.originalImageData = makeCheckerboard(64, 64);
        state.imgWidth = 64;
        state.imgHeight = 64;
        computeSuggestedBlocks();
        const smoothBlocks = state.suggestedBlocks.filter((b) => b.category === 'smooth');
        for (const b of smoothBlocks) {
            expect(b.score).toBeGreaterThan(0);
            expect(b.score).toBeLessThanOrEqual(1);
        }
    });

    it('edge score is non-negative', () => {
        state.originalImageData = makeCheckerboard(64, 64);
        state.imgWidth = 64;
        state.imgHeight = 64;
        computeSuggestedBlocks();
        const edgeBlocks = state.suggestedBlocks.filter((b) => b.category === 'edge');
        for (const b of edgeBlocks) {
            expect(b.score).toBeGreaterThanOrEqual(0);
        }
    });
});

// ─── renderSuggestedBlocks ──────────────────────────────────────────────

describe('renderSuggestedBlocks', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        container.id = 'suggestedBlocksList';
        document.body.appendChild(container);
    });

    afterEach(() => {
        if (container && container.parentNode) {
            document.body.removeChild(container);
        }
    });

    it('renders empty message when suggestedBlocks is empty', () => {
        state.suggestedBlocks = [];
        renderSuggestedBlocks('suggestedBlocksList', vi.fn());
        expect(container.querySelector('.suggested-blocks-empty')).not.toBeNull();
        expect(container.innerHTML).toContain('No suggestions available');
    });

    it('renders one button per suggestion', () => {
        state.suggestedBlocks = [
            { x: 0, y: 0, label: 'Edge', icon: '🔷', score: 50, category: 'edge' },
            { x: 1, y: 2, label: 'Texture', icon: '🔶', score: 30, category: 'texture' },
        ];
        renderSuggestedBlocks('suggestedBlocksList', vi.fn());
        expect(container.querySelectorAll('.suggested-block-btn')).toHaveLength(2);
    });

    it('buttons have correct data-bx and data-by attributes', () => {
        state.suggestedBlocks = [
            { x: 3, y: 7, label: 'Edge', icon: '🔷', score: 50, category: 'edge' },
        ];
        renderSuggestedBlocks('suggestedBlocksList', vi.fn());
        const btn = container.querySelector('.suggested-block-btn');
        expect(btn.dataset.bx).toBe('3');
        expect(btn.dataset.by).toBe('7');
    });

    it('renders a category header for each present category', () => {
        state.suggestedBlocks = [
            { x: 0, y: 0, label: 'Edge', icon: '🔷', score: 50, category: 'edge' },
            { x: 1, y: 0, label: 'Smooth', icon: '🟢', score: 0.9, category: 'smooth' },
        ];
        renderSuggestedBlocks('suggestedBlocksList', vi.fn());
        // edge and smooth present → 2 headers; texture absent → 0
        expect(container.querySelectorAll('.suggested-category-header')).toHaveLength(2);
    });

    it('does not render a category header for absent categories', () => {
        state.suggestedBlocks = [
            { x: 0, y: 0, label: 'Edge', icon: '🔷', score: 50, category: 'edge' },
        ];
        renderSuggestedBlocks('suggestedBlocksList', vi.fn());
        // Only edge present → 1 header
        expect(container.querySelectorAll('.suggested-category-header')).toHaveLength(1);
    });

    it('calls onSelect with (x, y) when a button is clicked', () => {
        const onSelect = vi.fn();
        state.suggestedBlocks = [
            { x: 2, y: 4, label: 'Edge', icon: '🔷', score: 50, category: 'edge' },
        ];
        renderSuggestedBlocks('suggestedBlocksList', onSelect);
        container.querySelector('.suggested-block-btn').click();
        expect(onSelect).toHaveBeenCalledWith(2, 4);
    });

    it('adds active class to clicked button and removes it from siblings', () => {
        const onSelect = vi.fn();
        state.suggestedBlocks = [
            { x: 0, y: 0, label: 'Edge', icon: '🔷', score: 50, category: 'edge' },
            { x: 1, y: 0, label: 'Edge', icon: '🔷', score: 40, category: 'edge' },
        ];
        renderSuggestedBlocks('suggestedBlocksList', onSelect);
        const buttons = container.querySelectorAll('.suggested-block-btn');

        buttons[0].click();
        expect(buttons[0].classList.contains('active')).toBe(true);
        expect(buttons[1].classList.contains('active')).toBe(false);

        buttons[1].click();
        expect(buttons[0].classList.contains('active')).toBe(false);
        expect(buttons[1].classList.contains('active')).toBe(true);
    });

    it('does nothing when the container element does not exist', () => {
        expect(() => renderSuggestedBlocks('does-not-exist', vi.fn())).not.toThrow();
    });

    it('clears previous content on re-render', () => {
        state.suggestedBlocks = [
            { x: 0, y: 0, label: 'Edge', icon: '🔷', score: 50, category: 'edge' },
        ];
        renderSuggestedBlocks('suggestedBlocksList', vi.fn());
        expect(container.querySelectorAll('.suggested-block-btn')).toHaveLength(1);

        state.suggestedBlocks = [];
        renderSuggestedBlocks('suggestedBlocksList', vi.fn());
        expect(container.querySelectorAll('.suggested-block-btn')).toHaveLength(0);
    });
});
