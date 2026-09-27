// Motion estimation end to end against the real WASM build (web/public/codec.js),
// not the Module mock used by the other browser tests.
import { describe, it, expect, beforeAll } from 'vitest';
import { defaultScenario } from '../../src/lib/motion/synthetic.js';
import { prepareFrames, runSearch } from '../../src/lib/motion/controller.js';
import {
    SearchAlgorithm, getSearchTrace, getCostSurface, estimateFrameBits,
} from '../../src/lib/motion/me-bridge.js';
import { buildAnimation, finalBest } from '../../src/lib/motion/search-anim.js';

// Generous for slow CI runners; locally full search at R32 takes ~150 ms.
const FULL_SEARCH_R32_BUDGET_MS = 800;

let image;

function loadRealWasm() {
    return new Promise((resolve, reject) => {
        globalThis.Module = {
            locateFile: (file) => `/public/${file}`,
            onRuntimeInitialized: () => resolve(),
            onAbort: (reason) => reject(new Error(`WASM aborted: ${reason}`)),
        };
        const script = document.createElement('script');
        script.src = '/public/codec.js';
        script.onerror = () => reject(new Error('Failed to load /public/codec.js'));
        document.head.appendChild(script);
    });
}

async function loadKodak(index) {
    const blob = await (await fetch(`/public/test-images/${index}.png`)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}

const params = (algorithm, blockSize = 16, searchRange = 16) => ({ algorithm, blockSize, searchRange });

beforeAll(async () => {
    await loadRealWasm();
    image = await loadKodak(3);
}, 30000);

describe('motion estimation with the real WASM module', () => {
    it('recovers an integer camera pan exactly with full search', () => {
        const scenario = { ...defaultScenario('pan'), dx: 6, dy: -3 };
        const frames = prepareFrames(image, scenario);
        expect(frames).not.toBeNull();
        const run = runSearch(frames, scenario, params(SearchAlgorithm.Full));
        expect(run.accuracy.scored).toBeGreaterThan(1000);
        expect(run.accuracy.exactPercent).toBe(100);
        // Every scored vector points back to the source: content moved (+6, -3).
        const i = run.truths.findIndex((t) => !t.excluded);
        expect(run.mvs[i]).toMatchObject({ dx: -6, dy: 3 });
        expect(run.stats.meanAbsResidual).toBeLessThan(run.stats.meanAbsFrameDiff * 0.2);
    });

    it('stays within a pixel on average for zoom, where true motion is fractional', () => {
        const scenario = { ...defaultScenario('zoom'), scale: 1.03 };
        const frames = prepareFrames(image, scenario);
        const run = runSearch(frames, scenario, params(SearchAlgorithm.Full));
        expect(run.accuracy.meanEndpointError).toBeLessThan(1);
    });

    it('fast searches check far fewer candidates than full search', () => {
        const scenario = defaultScenario('pan');
        const frames = prepareFrames(image, scenario);
        const full = runSearch(frames, scenario, params(SearchAlgorithm.Full));
        for (const alg of [SearchAlgorithm.ThreeStep, SearchAlgorithm.Diamond]) {
            const fast = runSearch(frames, scenario, params(alg));
            expect(fast.stats.candidates * 10).toBeLessThan(full.stats.candidates);
        }
    });

    it('trace, cost surface and result agree for a block', () => {
        const scenario = defaultScenario('pan');
        const frames = prepareFrames(image, scenario);
        for (const alg of [SearchAlgorithm.Full, SearchAlgorithm.ThreeStep, SearchAlgorithm.Diamond]) {
            const run = runSearch(frames, scenario, params(alg, 16, 8));
            const col = 20, row = 12;
            const mv = run.mvs[row * run.grid.cols + col];
            const best = finalBest(buildAnimation(getSearchTrace(col, row, alg)));
            expect(best).toMatchObject({ dx: mv.dx, dy: mv.dy, sad: mv.sad });

            const surface = getCostSurface(col, row, 8);
            expect(surface.length).toBe(17 * 17);
            expect(surface[(mv.dy + 8) * 17 + (mv.dx + 8)]).toBe(mv.sad);
            if (alg === SearchAlgorithm.Full) {
                expect(Math.min(...surface.filter((v) => v >= 0))).toBe(mv.sad);
            }
        }
    });

    it('codes a motion-compensated pan in far fewer bits than an intra frame', () => {
        const scenario = { ...defaultScenario('pan'), dx: 6, dy: -3 };
        const frames = prepareFrames(image, scenario);
        runSearch(frames, scenario, params(SearchAlgorithm.Full));
        const bits = estimateFrameBits(50);
        expect(bits.blocks).toBe((image.width / 8) * (image.height / 8));
        expect((bits.residualBits + bits.vectorBits) * 3).toBeLessThan(bits.intraBits);
    });

    it(`runs full search at R32 on 768x512 within ${FULL_SEARCH_R32_BUDGET_MS} ms`, () => {
        const scenario = defaultScenario('pan');
        const frames = prepareFrames(image, scenario);
        runSearch(frames, scenario, params(SearchAlgorithm.Full, 16, 32));  // warm-up
        const run = runSearch(frames, scenario, params(SearchAlgorithm.Full, 16, 32));
        console.log(`[perf] full search 768x512 bs16 R32: ${run.elapsedMs.toFixed(0)} ms`);
        expect(run.elapsedMs).toBeLessThan(FULL_SEARCH_R32_BUDGET_MS);
    });
});
