// Browser setup runs in the real Chromium context before each test file.
// We install the Module mock on window so that wasm-bridge.js and
// inspection.js find it when their functions are called during tests.
//
// HEAPU8 must be backed by a real ArrayBuffer because inspection.js uses
// `new DataView(Module.HEAPU8.buffer)` directly.

const HEAP_SIZE = 65536; // 64 KB
const heapBuffer = new ArrayBuffer(HEAP_SIZE);

globalThis.Module = {
    calledRun: true,
    onRuntimeInitialized: null,
    HEAPU8: new Uint8Array(heapBuffer),
    _malloc: () => 256,
    _free: () => {},
    _init_session: () => {},
    _process_image: () => {},
    _get_view_ptr: () => 256,
    _set_view_tint: () => {},
    _get_psnr_y: () => 35.5,
    _get_psnr_cr: () => 38.2,
    _get_psnr_cb: () => 37.8,
    _get_ssim_y: () => 0.9421,
    _get_ssim_cr: () => 0.9612,
    _get_ssim_cb: () => 0.9588,
    _inspect_block_data: () => 256,
};
