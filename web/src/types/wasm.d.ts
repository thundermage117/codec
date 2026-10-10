// The C functions the WASM build exports. Each must be listed in the Makefile's
// WEB_EXPORTS or marked EMSCRIPTEN_KEEPALIVE in web/cpp/codec_web.cpp
// (checked by tests/unit/wasm-exports.test.js).
declare global {
    var Module: WasmModule;
}

export interface WasmModule {
    HEAPU8: Uint8Array;
    calledRun: boolean;
    onRuntimeInitialized: () => void;
    onAbort?: (reason: unknown) => void;

    _malloc(size: number): number;
    _free(ptr: number): void;
    _init_session(ptr: number, width: number, height: number): void;
    _process_image(quality: number, csMode: number, transformMode: number): void;
    _preview_image(quality: number, csMode: number, transformMode: number): void;
    _rd_encode(quality: number, csMode: number, transformMode: number): number;
    _get_rd_bit_estimate(): number;
    _get_view_ptr(viewMode: number): number;
    _set_view_tint(enabled: number): void;
    _set_artifact_gain(gain: number): void;
    _inspect_block_data(blockX: number, blockY: number, channelIndex: number, quality: number, csMode: number, transformMode: number): number;
    _get_coeff_stats(quality: number): number;
    _get_psnr_y(): number;
    _get_psnr_cr(): number;
    _get_psnr_cb(): number;
    _get_ssim_y(): number;
    _get_ssim_cr(): number;
    _get_ssim_cb(): number;
    _get_last_bit_estimate(): number;
}

export { };
