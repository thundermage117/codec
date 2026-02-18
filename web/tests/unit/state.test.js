import { describe, it, expect, beforeEach } from 'vitest';
import { ViewMode, state } from '../../public/js/state.js';

const INITIAL_STATE = {
    originalImageData: null,
    imgWidth: 0,
    imgHeight: 0,
    currentViewMode: ViewMode.RGB,
    currentCsMode: 444,
    maxDim: 1024,
    wasmReady: false,
    isInspectMode: false,
    highlightBlock: null,
    inspectedBlock: null,
    isDragging: false,
    appMode: 'viewer',
    suggestedBlocks: [],
};

// state is a shared mutable object — reset it before each test.
beforeEach(() => {
    Object.assign(state, INITIAL_STATE);
    state.suggestedBlocks = [];
});

describe('ViewMode', () => {
    it('RGB is 0', () => {
        expect(ViewMode.RGB).toBe(0);
    });

    it('Artifacts is 1', () => {
        expect(ViewMode.Artifacts).toBe(1);
    });

    it('Y is 2', () => {
        expect(ViewMode.Y).toBe(2);
    });

    it('Cr is 3', () => {
        expect(ViewMode.Cr).toBe(3);
    });

    it('Cb is 4', () => {
        expect(ViewMode.Cb).toBe(4);
    });

    it('has exactly 5 entries', () => {
        expect(Object.keys(ViewMode)).toHaveLength(5);
    });

    it('all values are unique integers', () => {
        const values = Object.values(ViewMode);
        expect(new Set(values).size).toBe(values.length);
        values.forEach((v) => expect(Number.isInteger(v)).toBe(true));
    });
});

describe('state initial values', () => {
    it('originalImageData is null', () => {
        expect(state.originalImageData).toBeNull();
    });

    it('imgWidth and imgHeight are 0', () => {
        expect(state.imgWidth).toBe(0);
        expect(state.imgHeight).toBe(0);
    });

    it('currentViewMode is RGB', () => {
        expect(state.currentViewMode).toBe(ViewMode.RGB);
    });

    it('currentCsMode is 444', () => {
        expect(state.currentCsMode).toBe(444);
    });

    it('maxDim is 1024', () => {
        expect(state.maxDim).toBe(1024);
    });

    it('wasmReady is false', () => {
        expect(state.wasmReady).toBe(false);
    });

    it('isInspectMode is false', () => {
        expect(state.isInspectMode).toBe(false);
    });

    it('highlightBlock is null', () => {
        expect(state.highlightBlock).toBeNull();
    });

    it('inspectedBlock is null', () => {
        expect(state.inspectedBlock).toBeNull();
    });

    it('isDragging is false', () => {
        expect(state.isDragging).toBe(false);
    });

    it('appMode is viewer', () => {
        expect(state.appMode).toBe('viewer');
    });

    it('suggestedBlocks is an empty array', () => {
        expect(state.suggestedBlocks).toEqual([]);
    });
});

describe('state mutations', () => {
    it('wasmReady can be set to true', () => {
        state.wasmReady = true;
        expect(state.wasmReady).toBe(true);
    });

    it('appMode can be switched to inspector', () => {
        state.appMode = 'inspector';
        expect(state.appMode).toBe('inspector');
    });

    it('inspectedBlock can be set to coordinates', () => {
        state.inspectedBlock = { x: 3, y: 7 };
        expect(state.inspectedBlock).toEqual({ x: 3, y: 7 });
    });

    it('currentViewMode can be changed', () => {
        state.currentViewMode = ViewMode.Y;
        expect(state.currentViewMode).toBe(ViewMode.Y);
    });

    it('currentCsMode can be changed to 422', () => {
        state.currentCsMode = 422;
        expect(state.currentCsMode).toBe(422);
    });

    it('currentCsMode can be changed to 420', () => {
        state.currentCsMode = 420;
        expect(state.currentCsMode).toBe(420);
    });

    it('suggestedBlocks can be populated', () => {
        state.suggestedBlocks.push({ x: 0, y: 0, label: 'Edge', icon: '🔷', score: 50, category: 'edge' });
        expect(state.suggestedBlocks).toHaveLength(1);
    });

    it('suggestedBlocks can be reassigned', () => {
        const blocks = [{ x: 1, y: 2, label: 'Texture', icon: '🔶', score: 30, category: 'texture' }];
        state.suggestedBlocks = blocks;
        expect(state.suggestedBlocks).toBe(blocks);
    });

    it('originalImageData can store RGBA pixel data', () => {
        const data = new Uint8ClampedArray(64 * 64 * 4);
        state.originalImageData = { data, width: 64, height: 64 };
        expect(state.originalImageData.data).toBe(data);
        expect(state.originalImageData.width).toBe(64);
    });
});
