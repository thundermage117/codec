import { describe, it, expect } from 'vitest';
import { buildAnimation, stepsPerSecond, visibleCandidates, finalBest } from '../../src/lib/motion/search-anim.js';

const c = (dx, dy, sad, iteration) => ({ dx, dy, sad, iteration });

describe('buildAnimation', () => {
    const trace = [c(0, 0, 50, 0), c(4, 0, 30, 1), c(-4, 0, 40, 1), c(4, 2, 30, 2), c(2, 0, 30, 3), c(3, 0, 10, 3)];
    const anim = buildAnimation(trace);

    it('tracks the best candidate after every step', () => {
        expect(anim.bestAt).toEqual([0, 1, 1, 1, 4, 5]);
    });

    it('breaks SAD ties towards the shorter vector, like the C++ search', () => {
        // (4,2) ties (4,0) and is longer: kept (4,0). (2,0) ties and is shorter: taken.
        expect(anim.bestAt[3]).toBe(1);
        expect(anim.bestAt[4]).toBe(4);
    });

    it('counts distinct iterations', () => {
        expect(anim.iterations).toBe(4);
    });

    it('ends on the block vector', () => {
        expect(finalBest(anim)).toEqual(c(3, 0, 10, 3));
    });

    it('reveals candidates up to the current step', () => {
        expect(visibleCandidates(anim, -1)).toEqual([]);
        expect(visibleCandidates(anim, 1)).toEqual(trace.slice(0, 2));
        expect(visibleCandidates(anim, 99)).toEqual(trace);
    });
});

describe('empty trace', () => {
    it('has no best candidate', () => {
        const anim = buildAnimation([]);
        expect(finalBest(anim)).toBeNull();
        expect(anim.iterations).toBe(0);
    });
});

describe('stepsPerSecond', () => {
    it('targets a fixed duration with a minimum speed', () => {
        expect(stepsPerSecond(1089)).toBeCloseTo(272.25);
        expect(stepsPerSecond(12)).toBe(6);
    });
});
