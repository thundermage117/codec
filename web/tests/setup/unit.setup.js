import { vi, beforeEach } from 'vitest';

// ─── Canvas API Mock ────────────────────────────────────────────────────
// jsdom does not implement Canvas 2D, so we provide a manual mock.

class MockCanvasRenderingContext2D {
    constructor() {
        this.fillStyle = '';
        this.strokeStyle = '';
        this.lineWidth = 1;
    }
    clearRect() {}
    fillRect() {}
    strokeRect() {}
    drawImage() {}
    beginPath() {}
    moveTo() {}
    lineTo() {}
    stroke() {}
    putImageData() {}
    getImageData(x, y, w, h) {
        return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
    }
    createImageData(w, h) {
        return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
    }
}

HTMLCanvasElement.prototype.getContext = vi.fn(function (type) {
    if (type === '2d') return new MockCanvasRenderingContext2D();
    return null;
});

// ─── URL API Mocks ──────────────────────────────────────────────────────
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url-12345');
global.URL.revokeObjectURL = vi.fn();

// ─── WASM Module Mock ───────────────────────────────────────────────────
// wasm-bridge.js and inspection.js access `Module` as a bare global.
// Installing on globalThis before any test module is imported makes
// `typeof Module !== 'undefined'` evaluate to true in those modules.
//
// HEAPU8 must be a real Uint8Array backed by a real ArrayBuffer because
// inspection.js reads `new DataView(Module.HEAPU8.buffer)` directly.

const HEAP_SIZE = 65536; // 64 KB
const heapBuffer = new ArrayBuffer(HEAP_SIZE);

globalThis.Module = {
    calledRun: true, // causes setupWasm() to call onReady() immediately
    onRuntimeInitialized: null,
    HEAPU8: new Uint8Array(heapBuffer),
    _malloc: vi.fn(() => 256),
    _free: vi.fn(),
    _init_session: vi.fn(),
    _process_image: vi.fn(),
    _get_view_ptr: vi.fn(() => 256),
    _set_view_tint: vi.fn(),
    _get_psnr_y: vi.fn(() => 35.5),
    _get_psnr_cr: vi.fn(() => 38.2),
    _get_psnr_cb: vi.fn(() => 37.8),
    _get_ssim_y: vi.fn(() => 0.9421),
    _get_ssim_cr: vi.fn(() => 0.9612),
    _get_ssim_cb: vi.fn(() => 0.9588),
    _inspect_block_data: vi.fn(() => 256),
};

// Reset mock call counts and heap between tests.
// We keep the same object reference since modules close over it at import time.
beforeEach(() => {
    Object.values(globalThis.Module).forEach((fn) => {
        if (typeof fn?.mockClear === 'function') fn.mockClear();
    });
    globalThis.Module.HEAPU8.fill(0);
    globalThis.Module.calledRun = true;
});
