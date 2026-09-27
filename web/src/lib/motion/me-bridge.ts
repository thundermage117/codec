// Typed wrappers around the motion-estimation WASM bindings.
// Every buffer returned by the module is copied out and freed before returning.

export const SearchAlgorithm = {
    Full: 0,
    ThreeStep: 1,
    Diamond: 2,
} as const;

export type SearchAlgorithmValue = typeof SearchAlgorithm[keyof typeof SearchAlgorithm];

export const MotionView = {
    Prediction: 0,
    Residual: 1,
    FrameDifference: 2,
} as const;

export type MotionViewValue = typeof MotionView[keyof typeof MotionView];

// (dx, dy): the block at (x, y) in the current frame is predicted from
// (x + dx, y + dy) in the reference frame.
export interface MotionVector {
    dx: number;
    dy: number;
    sad: number;
}

export interface MotionStats {
    candidates: number;         // unique SAD evaluations over all blocks
    meanAbsResidual: number;    // with motion compensation
    meanAbsFrameDiff: number;   // without (zero vectors)
    predictionPsnr: number;     // dB, 99 when the prediction is exact
}

export interface SearchCandidate {
    dx: number;
    dy: number;
    sad: number;
    iteration: number;
}

function withFree<T>(ptr: number, read: (ptr: number) => T): T {
    try {
        return read(ptr);
    } finally {
        Module._free(ptr);
    }
}

function copyInt32(ptr: number, count: number): Int32Array {
    return new Int32Array(Module.HEAPU8.buffer, ptr, count).slice();
}

// Loads a reference/current frame pair. Returns false if sizes differ.
export function initMotionSession(reference: ImageData, current: ImageData): boolean {
    if (reference.width !== current.width || reference.height !== current.height) return false;
    const size = reference.data.length;
    let refPtr = 0;
    let curPtr = 0;
    try {
        refPtr = Module._malloc(size);
        curPtr = Module._malloc(size);
        if (!refPtr || !curPtr) return false;
        Module.HEAPU8.set(reference.data, refPtr);
        Module.HEAPU8.set(current.data, curPtr);
        return Module._init_me_session(refPtr, reference.width, reference.height,
            curPtr, current.width, current.height) === 1;
    } finally {
        if (refPtr) Module._free(refPtr);
        if (curPtr) Module._free(curPtr);
    }
}

// Runs the search; vectors are in raster block order. Null on invalid input.
export function runMotionEstimation(blockSize: number, searchRange: number,
    algorithm: SearchAlgorithmValue): MotionVector[] | null {
    const ptr = Module._run_motion_estimation(blockSize, searchRange, algorithm);
    if (!ptr) return null;
    const count = Module._get_mv_count();
    const raw = withFree(ptr, (p) => copyInt32(p, count * 3));
    const mvs: MotionVector[] = new Array(count);
    for (let i = 0; i < count; i++) {
        mvs[i] = { dx: raw[i * 3], dy: raw[i * 3 + 1], sad: raw[i * 3 + 2] };
    }
    return mvs;
}

// Statistics of the last run (static storage in WASM; nothing to free).
export function getMotionStats(): MotionStats {
    const ptr = Module._get_me_stats();
    const s = new Float64Array(Module.HEAPU8.buffer, ptr, 4);
    return {
        candidates: s[0],
        meanAbsResidual: s[1],
        meanAbsFrameDiff: s[2],
        predictionPsnr: s[3],
    };
}

// Copies a grey view of the last run into target (must match the frame size).
export function readMotionView(kind: MotionViewValue, target: ImageData): boolean {
    const ptr = Module._get_me_view_ptr(kind);
    if (!ptr) return false;
    withFree(ptr, (p) => {
        target.data.set(new Uint8Array(Module.HEAPU8.buffer, p, target.data.length));
    });
    return true;
}

// Candidates evaluated for block (col, row), in evaluation order.
export function getSearchTrace(col: number, row: number,
    algorithm: SearchAlgorithmValue): SearchCandidate[] {
    const ptr = Module._get_me_trace(col, row, algorithm);
    if (!ptr) return [];
    const count = Module._get_me_trace_count();
    const raw = withFree(ptr, (p) => copyInt32(p, count * 4));
    const trace: SearchCandidate[] = new Array(count);
    for (let i = 0; i < count; i++) {
        trace[i] = { dx: raw[i * 4], dy: raw[i * 4 + 1], sad: raw[i * 4 + 2], iteration: raw[i * 4 + 3] };
    }
    return trace;
}

// SAD for every displacement of block (col, row): (2R+1)^2 values, row-major
// over dy = -R..R then dx = -R..R; -1 where the candidate leaves the frame.
export function getCostSurface(col: number, row: number, searchRange: number): Int32Array | null {
    const ptr = Module._get_me_cost_surface(col, row);
    if (!ptr) return null;
    const side = 2 * searchRange + 1;
    return withFree(ptr, (p) => copyInt32(p, side * side));
}
