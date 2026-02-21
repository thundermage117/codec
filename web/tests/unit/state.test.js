import { describe, it, expect, beforeEach } from 'vitest';
import { ViewMode, appState } from '../../src/lib/state.svelte.js';

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

// appState is a reactive class — reset relevant fields before each test.
beforeEach(() => {
    Object.assign(appState, INITIAL_STATE);
    appState.suggestedBlocks = [];
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

    it('has exactly 7 entries', () => {
        expect(Object.keys(ViewMode)).toHaveLength(7);
    });

    it('all values are unique integers', () => {
        const values = Object.values(ViewMode);
        expect(new Set(values).size).toBe(values.length);
        values.forEach((v) => expect(Number.isInteger(v)).toBe(true));
    });
});

describe('state initial values', () => {
    it('originalImageData is null', () => {
        expect(appState.originalImageData).toBeNull();
    });

    it('imgWidth and imgHeight are 0', () => {
        expect(appState.imgWidth).toBe(0);
        expect(appState.imgHeight).toBe(0);
    });

    it('currentViewMode is RGB', () => {
        expect(appState.currentViewMode).toBe(ViewMode.RGB);
    });

    it('currentCsMode is 444', () => {
        expect(appState.currentCsMode).toBe(444);
    });

    it('maxDim is 1024', () => {
        expect(appState.maxDim).toBe(1024);
    });

    it('wasmReady is false', () => {
        expect(appState.wasmReady).toBe(false);
    });

    it('isInspectMode is false', () => {
        expect(appState.isInspectMode).toBe(false);
    });

    it('highlightBlock is null', () => {
        expect(appState.highlightBlock).toBeNull();
    });

    it('inspectedBlock is null', () => {
        expect(appState.inspectedBlock).toBeNull();
    });

    it('isDragging is false', () => {
        expect(appState.isDragging).toBe(false);
    });

    it('appMode is viewer', () => {
        expect(appState.appMode).toBe('viewer');
    });

    it('suggestedBlocks is an empty array', () => {
        expect(appState.suggestedBlocks).toEqual([]);
    });
});

describe('state mutations', () => {
    it('wasmReady can be set to true', () => {
        appState.wasmReady = true;
        expect(appState.wasmReady).toBe(true);
    });

    it('appMode can be switched to inspector', () => {
        appState.appMode = 'inspector';
        expect(appState.appMode).toBe('inspector');
    });

    it('inspectedBlock can be set to coordinates', () => {
        appState.inspectedBlock = { x: 3, y: 7 };
        expect(appState.inspectedBlock).toEqual({ x: 3, y: 7 });
    });

    it('currentViewMode can be changed', () => {
        appState.currentViewMode = ViewMode.Y;
        expect(appState.currentViewMode).toBe(ViewMode.Y);
    });

    it('currentCsMode can be changed to 422', () => {
        appState.currentCsMode = 422;
        expect(appState.currentCsMode).toBe(422);
    });

    it('currentCsMode can be changed to 420', () => {
        appState.currentCsMode = 420;
        expect(appState.currentCsMode).toBe(420);
    });

    it('suggestedBlocks can be populated', () => {
        appState.suggestedBlocks.push({ x: 0, y: 0, label: 'Edge', icon: '🔷', score: 50, category: 'edge' });
        expect(appState.suggestedBlocks).toHaveLength(1);
    });

    it('suggestedBlocks can be reassigned', () => {
        const blocks = [{ x: 1, y: 2, label: 'Texture', icon: '🔶', score: 30, category: 'texture' }];
        appState.suggestedBlocks = blocks;
        expect(appState.suggestedBlocks).toEqual(blocks);
    });

    it('originalImageData can store RGBA pixel data', () => {
        const data = new Uint8ClampedArray(64 * 64 * 4);
        appState.originalImageData = { data, width: 64, height: 64 };
        expect(appState.originalImageData.width).toBe(64);
        expect(appState.originalImageData.data).toHaveLength(data.length);
    });
});
