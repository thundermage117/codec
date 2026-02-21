export function computeBasisPattern(u: number, v: number): Float64Array {
    const N = 8;
    const pattern = new Float64Array(64);
    const cu = (u === 0) ? 1 / Math.sqrt(2) : 1;
    const cv = (v === 0) ? 1 / Math.sqrt(2) : 1;

    for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
            pattern[y * N + x] = (cu * cv / 4) *
                Math.cos((2 * x + 1) * u * Math.PI / (2 * N)) *
                Math.cos((2 * y + 1) * v * Math.PI / (2 * N));
        }
    }
    return pattern;
}

export function getFreqLabel(row: number, col: number): string {
    if (row === 0 && col === 0) return 'DC';
    const level = row + col;
    if (level <= 2) return 'Low';
    if (level <= 5) return 'Mid';
    return 'High';
}

export const ZIGZAG_INDICES = new Uint8Array([
    0, 1, 8, 16, 9, 2, 3, 10,
    17, 24, 32, 25, 18, 11, 4, 5,
    12, 19, 26, 33, 40, 48, 41, 34,
    27, 20, 13, 6, 7, 14, 21, 28,
    35, 42, 49, 56, 57, 50, 43, 36,
    29, 22, 15, 23, 30, 37, 44, 51,
    58, 59, 52, 45, 38, 31, 39, 46,
    53, 60, 61, 54, 47, 55, 62, 63
]);

export interface EntropySymbol {
    type: 'DC' | 'AC' | 'ZRL' | 'EOB';
    zIndex: number;
    run?: number;
    size?: number;
    amplitude?: number;
    baseBits: number;
    magBits: number;
    totalBits: number;
}

export function getEntropySymbols(quantized: Float64Array | number[]): EntropySymbol[] {
    const symbols: EntropySymbol[] = [];

    // DC coefficient
    const dc = Math.round(quantized[0]);
    if (dc !== 0) {
        const size = Math.floor(Math.log2(Math.abs(dc))) + 1;
        // DC symbols use 2-9 bits for base category in JPEG
        symbols.push({ type: 'DC', zIndex: 0, size, amplitude: dc, baseBits: 3, magBits: size, totalBits: 3 + size });
    } else {
        symbols.push({ type: 'DC', zIndex: 0, size: 0, amplitude: 0, baseBits: 2, magBits: 0, totalBits: 2 });
    }

    // AC coefficients (Zig-zag scan)
    let run = 0;
    for (let i = 1; i < 64; i++) {
        const idx = ZIGZAG_INDICES[i];
        const ac = Math.round(quantized[idx]);

        if (ac === 0) {
            run++;
        } else {
            // Encode ZRL (Zero Run Length) symbols if run > 15
            while (run > 15) {
                // ZRL is a fixed 11-bit code in JPEG
                symbols.push({ type: 'ZRL', zIndex: i - run, run: 15, baseBits: 11, magBits: 0, totalBits: 11 });
                run -= 16;
            }

            const size = Math.floor(Math.log2(Math.abs(ac))) + 1;
            // AC symbols vary widely; 4-10 bits is a reasonable simulation for category + run
            const baseBits = (run < 4 && size < 4) ? 5 : 9;
            symbols.push({ type: 'AC', zIndex: i, run, size, amplitude: ac, baseBits, magBits: size, totalBits: baseBits + size });
            run = 0;
        }
    }

    // End of Block (EOB)
    if (run > 0) {
        // EOB is usually 2-4 bits
        symbols.push({ type: 'EOB', zIndex: 63, baseBits: 4, magBits: 0, totalBits: 4 });
    }

    return symbols;
}

export function estimateBlockBits(quantized: Float64Array | number[]): number {
    const symbols = getEntropySymbols(quantized);
    return symbols.reduce((acc, sym) => acc + sym.totalBits, 0);
}

// ─── Haar DWT utilities ──────────────────────────────────────────────────────

const INV_SQRT2 = 0.7071067811865476;

function haar1d_inv_js(data: Float64Array, n: number): void {
    const tmp = new Float64Array(8);
    const half = n >> 1;
    for (let k = 0; k < half; k++) {
        tmp[2 * k]     = (data[k] + data[k + half]) * INV_SQRT2;
        tmp[2 * k + 1] = (data[k] - data[k + half]) * INV_SQRT2;
    }
    for (let k = 0; k < n; k++) data[k] = tmp[k];
}

function idwt8x8_js(src: Float64Array): Float64Array {
    const tmp = new Float64Array(src);
    let size = 2;
    while (size <= 8) {
        for (let j = 0; j < size; j++) {
            const col = new Float64Array(size);
            for (let i = 0; i < size; i++) col[i] = tmp[i * 8 + j];
            haar1d_inv_js(col, size);
            for (let i = 0; i < size; i++) tmp[i * 8 + j] = col[i];
        }
        for (let i = 0; i < size; i++) {
            const row = new Float64Array(size);
            for (let j = 0; j < size; j++) row[j] = tmp[i * 8 + j];
            haar1d_inv_js(row, size);
            for (let j = 0; j < size; j++) tmp[i * 8 + j] = row[j];
        }
        size *= 2;
    }
    return tmp;
}

/*
 * Pixel-domain Haar basis function for coefficient position (u, v).
 * Computed by placing a unit impulse at (u, v) and applying the inverse DWT.
 * Analogous to computeBasisPattern but for Haar DWT coefficients.
 */
export function computeHaarBasisPattern(u: number, v: number): Float64Array {
    const impulse = new Float64Array(64);
    impulse[u * 8 + v] = 1.0;
    return idwt8x8_js(impulse);
}

/*
 * Returns a human-readable frequency label for a Haar DWT coefficient.
 * Subbands are organised by scale: coarsest (level-1 detail around DC) → finest.
 *   [0][0]       → DC (LL approximation)
 *   rows 0-1, cols 0-1 (excluding DC) → Low  (coarsest detail sub-bands)
 *   rows 0-3, cols 0-3 (excluding above) → Mid  (level-2 detail sub-bands)
 *   rest → High (finest detail sub-bands)
 */
export function getHaarFreqLabel(row: number, col: number): string {
    if (row === 0 && col === 0) return 'DC';
    if (row <= 1 && col <= 1) return 'Low';
    if (row <= 3 && col <= 3) return 'Mid';
    return 'High';
}
