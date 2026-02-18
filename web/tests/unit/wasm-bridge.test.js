import { describe, it, expect, beforeEach, vi } from 'vitest';
import { state } from '../../public/js/state.js';
import {
    setupWasm,
    initSession,
    processImage,
    getViewPtr,
    getStats,
    setViewTint,
    inspectBlockData,
    getHeapU8,
    free,
} from '../../public/js/wasm-bridge.js';

const INITIAL_STATE = {
    originalImageData: null,
    imgWidth: 0,
    imgHeight: 0,
    currentViewMode: 0,
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

beforeEach(() => {
    Object.assign(state, INITIAL_STATE);
    state.suggestedBlocks = [];
});

describe('setupWasm', () => {
    it('calls onReady immediately when Module.calledRun is true', () => {
        const onReady = vi.fn();
        setupWasm(onReady);
        expect(onReady).toHaveBeenCalledOnce();
    });

    it('assigns onRuntimeInitialized when Module has not yet run', () => {
        globalThis.Module.calledRun = false;
        const onReady = vi.fn();
        setupWasm(onReady);
        expect(globalThis.Module.onRuntimeInitialized).toBe(onReady);
        expect(onReady).not.toHaveBeenCalled();
        // restore for subsequent tests (unit.setup.js also resets this in beforeEach)
        globalThis.Module.calledRun = true;
    });
});

describe('initSession', () => {
    it('does nothing when state.originalImageData is null', () => {
        state.originalImageData = null;
        initSession();
        expect(globalThis.Module._malloc).not.toHaveBeenCalled();
    });

    it('allocates memory and calls _init_session with correct args', () => {
        const fakeData = new Uint8ClampedArray(4 * 4 * 4); // 4×4 image
        state.originalImageData = { data: fakeData, width: 4, height: 4 };
        state.imgWidth = 4;
        state.imgHeight = 4;

        initSession();

        expect(globalThis.Module._malloc).toHaveBeenCalledWith(fakeData.length);
        expect(globalThis.Module._init_session).toHaveBeenCalledWith(256, 4, 4);
    });

    it('always calls _free after _init_session, even on success', () => {
        const fakeData = new Uint8ClampedArray(4);
        state.originalImageData = { data: fakeData, width: 1, height: 1 };
        state.imgWidth = 1;
        state.imgHeight = 1;

        initSession();

        expect(globalThis.Module._free).toHaveBeenCalledWith(256);
    });

    it('calls _free even when _init_session throws', () => {
        const fakeData = new Uint8ClampedArray(4);
        state.originalImageData = { data: fakeData, width: 1, height: 1 };
        state.imgWidth = 1;
        state.imgHeight = 1;
        globalThis.Module._init_session.mockImplementationOnce(() => {
            throw new Error('WASM error');
        });

        expect(() => initSession()).toThrow('WASM error');
        expect(globalThis.Module._free).toHaveBeenCalledWith(256);
    });
});

describe('processImage', () => {
    it('delegates to Module._process_image with quality and csMode', () => {
        processImage(75, 422);
        expect(globalThis.Module._process_image).toHaveBeenCalledWith(75, 422);
    });

    it('passes quality=0 and csMode=420 correctly', () => {
        processImage(0, 420);
        expect(globalThis.Module._process_image).toHaveBeenCalledWith(0, 420);
    });
});

describe('getViewPtr', () => {
    it('delegates to Module._get_view_ptr with the given viewMode', () => {
        getViewPtr(2);
        expect(globalThis.Module._get_view_ptr).toHaveBeenCalledWith(2);
    });

    it('returns the pointer from Module._get_view_ptr', () => {
        globalThis.Module._get_view_ptr.mockReturnValueOnce(512);
        expect(getViewPtr(0)).toBe(512);
    });
});

describe('getStats', () => {
    it('returns an object with psnr and ssim keys', () => {
        const stats = getStats();
        expect(stats).toHaveProperty('psnr');
        expect(stats).toHaveProperty('ssim');
    });

    it('psnr has y, cr, cb channels', () => {
        const { psnr } = getStats();
        expect(psnr).toHaveProperty('y');
        expect(psnr).toHaveProperty('cr');
        expect(psnr).toHaveProperty('cb');
    });

    it('ssim has y, cr, cb channels', () => {
        const { ssim } = getStats();
        expect(ssim).toHaveProperty('y');
        expect(ssim).toHaveProperty('cr');
        expect(ssim).toHaveProperty('cb');
    });

    it('returns values from the Module mock', () => {
        const stats = getStats();
        expect(stats.psnr.y).toBe(35.5);
        expect(stats.psnr.cr).toBe(38.2);
        expect(stats.psnr.cb).toBe(37.8);
        expect(stats.ssim.y).toBe(0.9421);
        expect(stats.ssim.cr).toBe(0.9612);
        expect(stats.ssim.cb).toBe(0.9588);
    });
});

describe('setViewTint', () => {
    it('passes 1 when enabled is true', () => {
        setViewTint(true);
        expect(globalThis.Module._set_view_tint).toHaveBeenCalledWith(1);
    });

    it('passes 0 when enabled is false', () => {
        setViewTint(false);
        expect(globalThis.Module._set_view_tint).toHaveBeenCalledWith(0);
    });
});

describe('inspectBlockData', () => {
    it('calls _inspect_block_data with blockX, blockY, channelIndex, quality, and state.currentCsMode', () => {
        state.currentCsMode = 420;
        inspectBlockData(3, 5, 0, 75);
        expect(globalThis.Module._inspect_block_data).toHaveBeenCalledWith(3, 5, 0, 75, 420);
    });

    it('uses state.currentCsMode=444 by default', () => {
        state.currentCsMode = 444;
        inspectBlockData(0, 0, 1, 50);
        expect(globalThis.Module._inspect_block_data).toHaveBeenCalledWith(0, 0, 1, 50, 444);
    });
});

describe('getHeapU8', () => {
    it('returns Module.HEAPU8', () => {
        expect(getHeapU8()).toBe(globalThis.Module.HEAPU8);
    });
});

describe('free', () => {
    it('delegates to Module._free', () => {
        free(1024);
        expect(globalThis.Module._free).toHaveBeenCalledWith(1024);
    });
});
