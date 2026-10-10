import { describe, it, expect } from 'vitest';
import { Transform, TRANSFORMS, transformInfo, isWavelet, nextTransform } from '../../src/lib/transforms.js';

describe('transforms', () => {
    it('matches the WASM transform_mode values', () => {
        expect(Transform).toEqual({ DCT: 0, Haar: 1, CDF97: 2 });
        expect(TRANSFORMS.map(t => t.value)).toEqual([0, 1, 2]);
    });

    it('has unique slugs', () => {
        const slugs = TRANSFORMS.map(t => t.slug);
        expect(new Set(slugs).size).toBe(slugs.length);
    });

    it('looks up info by value, falling back to DCT', () => {
        expect(transformInfo(2).label).toBe('CDF 9/7');
        expect(transformInfo(99).value).toBe(Transform.DCT);
    });

    it('treats only DCT as non-wavelet', () => {
        expect(isWavelet(Transform.DCT)).toBe(false);
        expect(isWavelet(Transform.Haar)).toBe(true);
        expect(isWavelet(Transform.CDF97)).toBe(true);
    });

    it('cycles through every transform and wraps around', () => {
        expect(nextTransform(Transform.DCT)).toBe(Transform.Haar);
        expect(nextTransform(Transform.Haar)).toBe(Transform.CDF97);
        expect(nextTransform(Transform.CDF97)).toBe(Transform.DCT);
    });
});
