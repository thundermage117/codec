// Transform types understood by the WASM codec (`transform_mode` argument).
// Mirrors map_transform_mode in web/cpp/codec_web.cpp (checked by
// tests/unit/wasm-contracts.test.js).
export const Transform = {
    DCT: 0,
    Haar: 1,
    CDF97: 2
} as const;

export type TransformValue = typeof Transform[keyof typeof Transform];

export interface TransformInfo {
    value: TransformValue;
    label: string;
    /** Stable short name used in URLs and download filenames. */
    slug: string;
    fullName: string;
    /** CSS color for this transform's chart series. */
    color: string;
}

export const TRANSFORMS: readonly TransformInfo[] = [
    { value: Transform.DCT, label: 'DCT', slug: 'dct', fullName: 'Discrete Cosine Transform', color: 'var(--series-dct)' },
    { value: Transform.Haar, label: 'Haar', slug: 'haar', fullName: 'Haar Discrete Wavelet Transform', color: 'var(--series-haar)' },
    { value: Transform.CDF97, label: 'CDF 9/7', slug: 'cdf97', fullName: 'CDF 9/7 Discrete Wavelet Transform', color: 'var(--series-cdf97)' }
];

export function transformInfo(value: number): TransformInfo {
    return TRANSFORMS.find(t => t.value === value) ?? TRANSFORMS[0];
}

export function isWavelet(value: number): boolean {
    return value !== Transform.DCT;
}

export function nextTransform(value: number): TransformValue {
    const i = TRANSFORMS.findIndex(t => t.value === value);
    return TRANSFORMS[(i + 1) % TRANSFORMS.length].value;
}
