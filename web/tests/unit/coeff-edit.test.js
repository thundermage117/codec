import { describe, it, expect, beforeEach } from 'vitest';
import { coeffEdit } from '../../src/lib/coeff-edit.svelte.js';
import { ZIGZAG_INDICES } from '../../src/lib/dct-utils.js';

describe('coeffEdit', () => {
    beforeEach(() => coeffEdit.reset());

    it('is inactive by default', () => {
        expect(coeffEdit.active).toBe(false);
        for (let i = 0; i < 64; i++) expect(coeffEdit.isDropped(i)).toBe(false);
    });

    it('keepFirst drops by zig-zag position, not raster order', () => {
        coeffEdit.keepFirst = 3; // keeps zig-zag 0, 1, 2 = raster 0, 1, 8
        expect(coeffEdit.active).toBe(true);
        const kept = [...Array(64).keys()].filter(i => !coeffEdit.isDropped(i));
        expect(kept.sort((a, b) => a - b)).toEqual([0, 1, 8]);
        expect(coeffEdit.isDropped(ZIGZAG_INDICES[3])).toBe(true);
    });

    it('toggle drops and restores individual coefficients', () => {
        coeffEdit.toggle(10);
        expect(coeffEdit.isDropped(10)).toBe(true);
        coeffEdit.toggle(10);
        expect(coeffEdit.isDropped(10)).toBe(false);
        expect(coeffEdit.active).toBe(false);
    });

    it('reset clears both kinds of edits', () => {
        coeffEdit.keepFirst = 5;
        coeffEdit.toggle(0);
        coeffEdit.reset();
        expect(coeffEdit.active).toBe(false);
    });
});
