import { expect, test, describe } from 'vitest';
import {
    computeBasisPattern,
    getFreqLabel,
    getEntropySymbols,
    reconstructBlock,
    estimateBlockBits,
    ZIGZAG_INDICES,
    computeHaarBasisPattern,
    getHaarFreqLabel
} from '../../src/lib/dct-utils';

describe('dct-utils', () => {
    describe('computeBasisPattern', () => {
        test('computes DC pattern for u=0, v=0', () => {
            const pattern = computeBasisPattern(0, 0);
            expect(pattern).toHaveLength(64);
            // DC coefficient basis is 1/8 (0.125) everywhere
            expect(pattern[0]).toBeCloseTo(0.125, 4);
            expect(pattern[63]).toBeCloseTo(0.125, 4);
        });

        test('computes AC pattern for u=1, v=1', () => {
            const pattern = computeBasisPattern(1, 1);
            expect(pattern).toHaveLength(64);
            expect(pattern[0]).not.toBeCloseTo(0.125, 4);
        });
    });

    describe('getFreqLabel', () => {
        test('identifies DC frequency', () => {
            expect(getFreqLabel(0, 0)).toBe('DC');
        });

        test('identifies Low frequencies', () => {
            expect(getFreqLabel(0, 1)).toBe('Low');
            expect(getFreqLabel(1, 0)).toBe('Low');
            expect(getFreqLabel(1, 1)).toBe('Low');
            expect(getFreqLabel(2, 0)).toBe('Low');
        });

        test('identifies Mid frequencies', () => {
            expect(getFreqLabel(0, 3)).toBe('Mid');
            expect(getFreqLabel(2, 2)).toBe('Mid');
            expect(getFreqLabel(5, 0)).toBe('Mid');
        });

        test('identifies High frequencies', () => {
            expect(getFreqLabel(0, 6)).toBe('High');
            expect(getFreqLabel(3, 3)).toBe('High');
            expect(getFreqLabel(7, 7)).toBe('High');
        });
    });

    describe('getEntropySymbols', () => {
        test('handles block with all zeros', () => {
            const block = new Array(64).fill(0);
            const symbols = getEntropySymbols(block);

            // Expected: DC=0, and EOB for the all-zero ACs
            expect(symbols).toHaveLength(2);

            expect(symbols[0].type).toBe('DC');
            expect(symbols[0].amplitude).toBe(0);
            expect(symbols[0].size).toBe(0);

            expect(symbols[1].type).toBe('EOB');
        });

        test('handles non-zero DC coefficient', () => {
            const block = new Array(64).fill(0);
            block[0] = 5; // Size = 3

            const symbols = getEntropySymbols(block);
            expect(symbols[0].type).toBe('DC');
            expect(symbols[0].amplitude).toBe(5);
            expect(symbols[0].size).toBe(3);
        });

        test('handles negative amplitude DC coefficient', () => {
            const block = new Array(64).fill(0);
            block[0] = -12; // Size = 4

            const symbols = getEntropySymbols(block);
            expect(symbols[0].amplitude).toBe(-12);
            expect(symbols[0].size).toBe(4);
        });

        test('handles single AC coefficient', () => {
            const block = new Array(64).fill(0);
            block[ZIGZAG_INDICES[1]] = 2; // run=0, size=2

            const symbols = getEntropySymbols(block);

            const acSymbols = symbols.filter(s => s.type === 'AC');
            expect(acSymbols).toHaveLength(1);
            expect(acSymbols[0].run).toBe(0);
            expect(acSymbols[0].size).toBe(2);
            expect(acSymbols[0].amplitude).toBe(2);
        });

        test('handles ZRL (Zero Run Length)', () => {
            const block = new Array(64).fill(0);
            // Place value at 18th position in zigzag (index 17 after DC)
            block[ZIGZAG_INDICES[17]] = 1;

            const symbols = getEntropySymbols(block);

            const zrls = symbols.filter(s => s.type === 'ZRL');
            expect(zrls).toHaveLength(1);
            expect(zrls[0].run).toBe(15);

            const acs = symbols.filter(s => s.type === 'AC');
            expect(acs).toHaveLength(1);
            expect(acs[0].run).toBe(0); // Actually it's run 16 -> ZRL(15), run 0 AC(1)
            expect(acs[0].amplitude).toBe(1);
        });

        test('handles multiple ZRLs', () => {
            const block = new Array(64).fill(0);
            block[ZIGZAG_INDICES[40]] = 1;

            const symbols = getEntropySymbols(block);
            const zrls = symbols.filter(s => s.type === 'ZRL');
            // run is 39 -> 39 / 16 = 2 ZRLs
            expect(zrls).toHaveLength(2);
        });
    });

    describe('estimateBlockBits', () => {
        test('estimates bits correctly for all-zero block', () => {
            const block = new Array(64).fill(0);
            const bits = estimateBlockBits(block);

            // DC 0: base=2 + mag=0 = 2 bits
            // EOB: base=4 = 4 bits
            // Total: 6 bits
            expect(bits).toBe(6);
        });

        test('estimates bits correctly for block with DC and one AC', () => {
            const block = new Array(64).fill(0);
            block[0] = 5; // DC: size=3, base=3 -> 6 bits
            block[ZIGZAG_INDICES[1]] = 2; // AC: run=0, size=2, base=5 -> 7 bits

            const bits = estimateBlockBits(block);

            // DC(6) + AC(7) + EOB(4) = 17 bits
            expect(bits).toBe(17);
        });
    });

    describe('Haar DWT utilities', () => {
        test('computeHaarBasisPattern returns 64 elements', () => {
            const pattern = computeHaarBasisPattern(0, 0);
            expect(pattern).toHaveLength(64);
        });

        test('computeHaarBasisPattern(0,0) is constant 0.125', () => {
            const pattern = computeHaarBasisPattern(0, 0);
            // In 8x8 Haar DWT, DC basis is 1/sqrt(64) = 1/8 = 0.125 everywhere if orthonormal
            expect(pattern[0]).toBeCloseTo(0.125, 4);
            expect(pattern[63]).toBeCloseTo(0.125, 4);
        });

        test('getHaarFreqLabel identifies subbands', () => {
            expect(getHaarFreqLabel(0, 0)).toBe('DC');
            expect(getHaarFreqLabel(0, 1)).toBe('Low');
            expect(getHaarFreqLabel(2, 2)).toBe('Mid');
            expect(getHaarFreqLabel(4, 4)).toBe('High');
        });
    });
});

describe('differential DC coding', () => {
    const block = (dc) => { const b = new Float64Array(64); b[0] = dc; return b; };

    it('codes DC as the difference from the previous block', () => {
        const [dcSym] = getEntropySymbols(block(20), 18);
        expect(dcSym.type).toBe('DC');
        expect(dcSym.amplitude).toBe(2);
        expect(dcSym.dcValue).toBe(20);
        expect(dcSym.dcPredictor).toBe(18);
        expect(dcSym.size).toBe(2); // |2| needs 2 magnitude bits
    });

    it('makes a DC equal to its predictor cheap', () => {
        expect(estimateBlockBits(block(37), 37)).toBeLessThan(estimateBlockBits(block(37), 0));
    });

    it('defaults to a zero predictor (first block of a scan)', () => {
        expect(getEntropySymbols(block(5))[0].amplitude).toBe(5);
    });
});

describe('reconstructBlock', () => {
    it('a DC-only block reconstructs to a flat block offset by 128', () => {
        const coeffs = new Float64Array(64);
        coeffs[0] = 80; // orthonormal DC: mean offset = 80 / 8 = 10
        const out = reconstructBlock(coeffs);
        for (const v of out) expect(v).toBeCloseTo(138, 10);
    });

    it('dropping a coefficient removes exactly its basis pattern', () => {
        const coeffs = new Float64Array(64);
        coeffs[0] = 40; coeffs[1] = 25; coeffs[9] = -12;
        const all = reconstructBlock(coeffs);
        const without = reconstructBlock(coeffs, k => k !== 1);
        // Index 1 = row 0, col 1: varies horizontally only.
        for (let y = 0; y < 8; y++) {
            const d0 = all[y * 8] - without[y * 8];
            expect(d0).toBeGreaterThan(0);
            for (let x = 0; x < 8; x++) {
                expect(all[y * 8 + x] - without[y * 8 + x]).toBeCloseTo(all[x] - without[x], 10);
            }
        }
    });
});
