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
        symbols.push({ type: 'DC', size, amplitude: dc, baseBits: 4, magBits: size, totalBits: 4 + size });
    } else {
        symbols.push({ type: 'DC', size: 0, amplitude: 0, baseBits: 2, magBits: 0, totalBits: 2 });
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
                symbols.push({ type: 'ZRL', run: 15, baseBits: 11, magBits: 0, totalBits: 11 });
                run -= 16;
            }

            const size = Math.floor(Math.log2(Math.abs(ac))) + 1;
            symbols.push({ type: 'AC', run, size, amplitude: ac, baseBits: 8, magBits: size, totalBits: 8 + size });
            run = 0;
        }
    }

    // End of Block (EOB)
    if (run > 0) {
        symbols.push({ type: 'EOB', baseBits: 4, magBits: 0, totalBits: 4 });
    }

    return symbols;
}

export function estimateBlockBits(quantized: Float64Array | number[]): number {
    const symbols = getEntropySymbols(quantized);
    return symbols.reduce((acc, sym) => acc + sym.totalBits, 0);
}
