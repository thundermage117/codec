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
