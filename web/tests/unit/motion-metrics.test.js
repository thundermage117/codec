import { describe, it, expect } from 'vitest';
import { blockVerdict, summarizeAccuracy, compensationGain } from '../../src/lib/motion/metrics.js';
import { motionArrow, arrowLengthScale, motionColor } from '../../src/lib/motion/mv-render.js';
import { heatColor } from '../../src/lib/colormap.js';

const mv = (dx, dy, sad = 0) => ({ dx, dy, sad });
const truth = (dx, dy) => ({ excluded: false, dx, dy });
const excluded = { excluded: true, reason: 'boundary' };

describe('blockVerdict', () => {
    it('is exact when the vector equals the rounded truth', () => {
        expect(blockVerdict(mv(-5, 3), truth(-5, 3))).toBe('exact');
        expect(blockVerdict(mv(-3, 0), truth(-2.6, 0.2))).toBe('exact');
    });

    it('is close within one pixel, wrong beyond', () => {
        expect(blockVerdict(mv(-2, 0), truth(-2.6, 0))).toBe('close');
        expect(blockVerdict(mv(1, 0), truth(-2, 0))).toBe('wrong');
    });

    it('is excluded when there is no single truth', () => {
        expect(blockVerdict(mv(0, 0), excluded)).toBe('excluded');
    });
});

describe('summarizeAccuracy', () => {
    it('counts verdicts and averages endpoint error over scored blocks only', () => {
        const s = summarizeAccuracy(
            [mv(-5, 0), mv(-4, 0), mv(3, 4), mv(9, 9)],
            [truth(-5, 0), truth(-5, 0), truth(0, 0), excluded],
        );
        expect(s).toMatchObject({ scored: 3, excluded: 1, exact: 1, close: 1, wrong: 1 });
        expect(s.exactPercent).toBeCloseTo(100 / 3);
        expect(s.meanEndpointError).toBeCloseTo((0 + 1 + 5) / 3);
    });

    it('handles no scorable blocks', () => {
        expect(summarizeAccuracy([mv(0, 0)], [excluded])).toMatchObject({ scored: 0, exactPercent: 0, meanEndpointError: 0 });
    });
});

describe('compensationGain', () => {
    it('is the share of frame-difference error removed', () => {
        expect(compensationGain(2, 10)).toBeCloseTo(80);
        expect(compensationGain(12, 10)).toBe(0);
        expect(compensationGain(0, 0)).toBe(0);
    });
});

describe('motionArrow', () => {
    it('points along the motion of content, opposite to the stored vector', () => {
        // Vector (-4, 0) means the block came from 4 px to the left: content moved right.
        const a = motionArrow(1, 1, 16, mv(-4, 0));
        expect(a.x1).toBeGreaterThan(a.x0);
        expect(a.y1).toBe(a.y0);
    });

    it('is centred on the block and scaled uniformly', () => {
        const a = motionArrow(0, 0, 16, mv(0, 3), 2);
        expect((a.x0 + a.x1) / 2).toBe(8);
        expect((a.y0 + a.y1) / 2).toBe(8);
        expect(a.y0 - a.y1).toBe(6);  // content moved up by 3, drawn x2
    });

    it('draws nothing for a zero vector', () => {
        expect(motionArrow(0, 0, 16, mv(0, 0))).toBeNull();
    });
});

describe('arrowLengthScale', () => {
    it('enlarges short fields up to 4x but never shrinks', () => {
        expect(arrowLengthScale(16, 0)).toBe(1);
        expect(arrowLengthScale(16, 1)).toBe(4);
        expect(arrowLengthScale(16, 6.8)).toBeCloseTo(2);
        expect(arrowLengthScale(16, 30)).toBe(1);
    });
});

describe('colours', () => {
    it('maps direction to hue: right = 0, down = 90 (screen coordinates)', () => {
        expect(motionColor(mv(-3, 0), 3)).toMatch(/^hsl\(0,/);
        expect(motionColor(mv(0, -3), 3)).toMatch(/^hsl\(90,/);
    });

    it('heatColor spans black to white and clamps', () => {
        expect(heatColor(0)).toEqual([0, 0, 0]);
        expect(heatColor(1)).toEqual([255, 255, 255]);
        expect(heatColor(-1)).toEqual([0, 0, 0]);
        expect(heatColor(Number.NaN)).toEqual([0, 0, 0]);
    });
});
