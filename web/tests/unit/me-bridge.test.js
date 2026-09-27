import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    SearchAlgorithm, MotionView, initMotionSession, runMotionEstimation,
    getMotionStats, readMotionView, getSearchTrace, getCostSurface,
} from '../../src/lib/motion/me-bridge.js';

const M = globalThis.Module;
const PTR = 1024;

function writeInt32(ptr, values) {
    new Int32Array(M.HEAPU8.buffer, ptr, values.length).set(values);
}

function imageData(w, h, fill = 0) {
    return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(fill) };
}

beforeEach(() => {
    M._malloc = vi.fn()
        .mockReturnValueOnce(2048)
        .mockReturnValueOnce(4096);
    M._free = vi.fn();
    M._init_me_session = vi.fn(() => 1);
    M._run_motion_estimation = vi.fn(() => PTR);
    M._get_mv_count = vi.fn(() => 2);
    M._get_me_stats = vi.fn(() => PTR);
    M._get_me_view_ptr = vi.fn(() => PTR);
    M._get_me_trace = vi.fn(() => PTR);
    M._get_me_trace_count = vi.fn(() => 2);
    M._get_me_cost_surface = vi.fn(() => PTR);
});

describe('initMotionSession', () => {
    it('copies both frames into WASM memory, initialises, and frees them', () => {
        const ref = imageData(2, 2, 10);
        const cur = imageData(2, 2, 20);
        expect(initMotionSession(ref, cur)).toBe(true);
        expect(M.HEAPU8[2048]).toBe(10);
        expect(M.HEAPU8[4096]).toBe(20);
        expect(M._init_me_session).toHaveBeenCalledWith(2048, 2, 2, 4096, 2, 2);
        expect(M._free).toHaveBeenCalledWith(2048);
        expect(M._free).toHaveBeenCalledWith(4096);
    });

    it('rejects mismatched sizes without touching WASM', () => {
        expect(initMotionSession(imageData(2, 2), imageData(3, 2))).toBe(false);
        expect(M._malloc).not.toHaveBeenCalled();
    });

    it('reports failure from the binding and still frees', () => {
        M._init_me_session = vi.fn(() => 0);
        expect(initMotionSession(imageData(2, 2), imageData(2, 2))).toBe(false);
        expect(M._free).toHaveBeenCalledTimes(2);
    });
});

describe('runMotionEstimation', () => {
    it('decodes [dx, dy, sad] records and frees the buffer', () => {
        writeInt32(PTR, [-3, 2, 100, 0, 0, 7]);
        const mvs = runMotionEstimation(16, 8, SearchAlgorithm.Diamond);
        expect(M._run_motion_estimation).toHaveBeenCalledWith(16, 8, 2);
        expect(mvs).toEqual([{ dx: -3, dy: 2, sad: 100 }, { dx: 0, dy: 0, sad: 7 }]);
        expect(M._free).toHaveBeenCalledWith(PTR);
    });

    it('returns null when the binding rejects the parameters', () => {
        M._run_motion_estimation = vi.fn(() => 0);
        expect(runMotionEstimation(12, 8, SearchAlgorithm.Full)).toBeNull();
        expect(M._free).not.toHaveBeenCalled();
    });
});

describe('getMotionStats', () => {
    it('reads the four statistics without freeing static storage', () => {
        new Float64Array(M.HEAPU8.buffer, PTR, 4).set([1234, 1.5, 20.25, 38.5]);
        expect(getMotionStats()).toEqual({
            candidates: 1234, meanAbsResidual: 1.5, meanAbsFrameDiff: 20.25, predictionPsnr: 38.5,
        });
        expect(M._free).not.toHaveBeenCalled();
    });
});

describe('readMotionView', () => {
    it('copies RGBA into the target and frees', () => {
        M.HEAPU8.set([1, 2, 3, 255, 4, 5, 6, 255], PTR);
        const target = imageData(2, 1);
        expect(readMotionView(MotionView.Residual, target)).toBe(true);
        expect(M._get_me_view_ptr).toHaveBeenCalledWith(1);
        expect(Array.from(target.data)).toEqual([1, 2, 3, 255, 4, 5, 6, 255]);
        expect(M._free).toHaveBeenCalledWith(PTR);
    });

    it('returns false when there is no result yet', () => {
        M._get_me_view_ptr = vi.fn(() => 0);
        expect(readMotionView(MotionView.Prediction, imageData(1, 1))).toBe(false);
    });
});

describe('getSearchTrace', () => {
    it('decodes [dx, dy, sad, iteration] records in order', () => {
        writeInt32(PTR, [0, 0, 50, 0, 2, 0, 30, 1]);
        expect(getSearchTrace(3, 4, SearchAlgorithm.ThreeStep)).toEqual([
            { dx: 0, dy: 0, sad: 50, iteration: 0 },
            { dx: 2, dy: 0, sad: 30, iteration: 1 },
        ]);
        expect(M._get_me_trace).toHaveBeenCalledWith(3, 4, 1);
        expect(M._free).toHaveBeenCalledWith(PTR);
    });

    it('returns an empty trace for an invalid block', () => {
        M._get_me_trace = vi.fn(() => 0);
        expect(getSearchTrace(99, 0, SearchAlgorithm.Full)).toEqual([]);
    });
});

describe('getCostSurface', () => {
    it('returns a (2R+1)^2 copy that survives the free', () => {
        const values = Array.from({ length: 9 }, (_, i) => i - 1);
        writeInt32(PTR, values);
        const surface = getCostSurface(0, 0, 1);
        M.HEAPU8.fill(0);
        expect(Array.from(surface)).toEqual(values);
        expect(M._free).toHaveBeenCalledWith(PTR);
    });
});
