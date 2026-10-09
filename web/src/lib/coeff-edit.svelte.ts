import { ZIGZAG_INDICES } from './dct-utils.js';

// Zig-zag position (0 = DC … 63) of each raster index.
const ZIGZAG_POSITION = (() => {
    const pos = new Uint8Array(64);
    ZIGZAG_INDICES.forEach((rasterIdx, zz) => { pos[rasterIdx] = zz; });
    return pos;
})();

/**
 * "What if?" edits to the inspected block's coefficients: the decoder drops
 * (zeroes) some dequantized coefficients before the inverse DCT, either by
 * keeping only the first N in zig-zag order or by toggling individual ones.
 */
class CoefficientEdit {
    /** When on, clicking (or Enter on) a decoder-side coefficient toggles it. */
    editing = $state(false);
    /** Keep only zig-zag positions < keepFirst (64 = keep all). */
    keepFirst = $state(64);
    /** Raster indices toggled off individually. */
    dropped = $state<number[]>([]);
    /** Bumped after every inspector render so summaries can recompute. */
    renderVersion = $state(0);

    get active(): boolean {
        return this.keepFirst < 64 || this.dropped.length > 0;
    }

    isDropped(rasterIdx: number): boolean {
        return ZIGZAG_POSITION[rasterIdx] >= this.keepFirst || this.dropped.includes(rasterIdx);
    }

    toggle(rasterIdx: number): void {
        this.dropped = this.dropped.includes(rasterIdx)
            ? this.dropped.filter(i => i !== rasterIdx)
            : [...this.dropped, rasterIdx];
    }

    reset(): void {
        this.keepFirst = 64;
        this.dropped = [];
    }
}

export const coeffEdit = new CoefficientEdit();
