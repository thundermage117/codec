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
    _get_view_ptr(viewMode: number): number;
    _set_view_tint(enabled: number): void;
    _set_artifact_gain(gain: number): void;
    _inspect_block_data(blockX: number, blockY: number, channelIndex: number, quality: number, csMode: number, transformMode: number): number;
    _get_coeff_histogram(numBins: number, maxVal: number): number;
    _get_psnr_y(): number;
    _get_psnr_cr(): number;
    _get_psnr_cb(): number;
    _get_ssim_y(): number;
    _get_ssim_cr(): number;
    _get_ssim_cb(): number;
    _get_last_bit_estimate(): number;

    // Motion estimation (see web/cpp/codec_web.cpp)
    _init_me_session(refPtr: number, refW: number, refH: number, curPtr: number, curW: number, curH: number): number;
    _run_motion_estimation(blockSize: number, searchRange: number, algorithm: number): number;
    _get_mv_count(): number;
    _get_me_stats(): number;
    _get_me_view_ptr(kind: number): number;
    _get_me_trace(col: number, row: number, algorithm: number): number;
    _get_me_trace_count(): number;
    _get_me_cost_surface(col: number, row: number): number;
    _estimate_me_bits(quality: number): number;
}

export { };
