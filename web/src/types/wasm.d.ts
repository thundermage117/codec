declare global {
    var Module: WasmModule;
}

export interface WasmModule {
    HEAPU8: Uint8Array;
    calledRun: boolean;
    onRuntimeInitialized: () => void;

    _malloc(size: number): number;
    _free(ptr: number): void;
    _init_session(ptr: number, width: number, height: number): void;
    _process_image(quality: number, csMode: number, transformMode: number): void;
    _get_view_ptr(viewMode: number): number;
    _set_view_tint(enabled: number): void;
    _set_artifact_gain(gain: number): void;
    _inspect_block_data(blockX: number, blockY: number, channelIndex: number, quality: number, csMode: number, transformMode: number): number;
    _get_psnr_y(): number;
    _get_psnr_cr(): number;
    _get_psnr_cb(): number;
    _get_ssim_y(): number;
    _get_ssim_cr(): number;
    _get_ssim_cb(): number;
}

export {};
