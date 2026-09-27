import { describe, it, expect } from 'vitest';
import {
    defaultScenario, srcOf, pixelTruth, renderPair, blockTruth, objectLayout,
} from '../../src/lib/motion/synthetic.js';

// Image whose pixel values encode their coordinates (R = x, G = y).
function coordImage(w, h) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            data[i] = x;
            data[i + 1] = y;
            data[i + 2] = (x * 7 + y * 3) % 256;
            data[i + 3] = 255;
        }
    }
    return { width: w, height: h, data };
}

function px(img, x, y) {
    const i = (y * img.width + x) * 4;
    return [img.data[i], img.data[i + 1], img.data[i + 2]];
}

const pan = (dx, dy, extra = {}) => ({ ...defaultScenario('pan'), dx, dy, ...extra });

describe('pan', () => {
    it('moves content by (dx, dy): current(x, y) = reference(x - dx, y - dy)', () => {
        const img = coordImage(40, 30);
        const { reference, current } = renderPair(img, pan(5, -3));
        for (let y = 5; y < 25; y++) {
            for (let x = 6; x < 34; x++) {
                expect(px(current, x, y)).toEqual(px(reference, x - 5, y + 3));
            }
        }
    });

    it('ground truth points back to the source: content moving +v has truth -v', () => {
        expect(pixelTruth(pan(5, -3), 40, 30, 10, 10)).toEqual({ x: -5, y: 3 });
        const t = blockTruth(pan(5, -3), 64, 64, 16, 16, 16, 8);
        expect(t).toEqual({ excluded: false, dx: -5, dy: 3 });
    });

    it('keeps fractional truth for sub-pixel pans', () => {
        const t = blockTruth(pan(2.5, 0), 64, 64, 16, 16, 16, 8);
        expect(t).toEqual({ excluded: false, dx: -2.5, dy: 0 });
    });

    it('excludes blocks whose source leaves the frame', () => {
        // Content moves right, so the left-most block has no source.
        expect(blockTruth(pan(5, 0), 64, 64, 0, 16, 16, 8)).toEqual({ excluded: true, reason: 'out-of-frame' });
    });

    it('excludes blocks whose motion exceeds the search range', () => {
        expect(blockTruth(pan(10, 0), 96, 96, 32, 32, 16, 8)).toEqual({ excluded: true, reason: 'out-of-range' });
    });
});

describe('zoom and rotate', () => {
    it('keeps the image centre fixed', () => {
        for (const s of [{ ...defaultScenario('zoom'), scale: 1.2 }, { ...defaultScenario('rotate'), degrees: 30 }]) {
            const src = srcOf(s, 41, 21, 20, 10);
            expect(src.x).toBeCloseTo(20);
            expect(src.y).toBeCloseTo(10);
        }
    });

    it('zooming in pulls sources towards the centre', () => {
        const t = pixelTruth({ ...defaultScenario('zoom'), scale: 2 }, 41, 41, 40, 20);
        expect(t.x).toBeCloseTo(-10);  // source at x = 30
        expect(t.y).toBeCloseTo(0);
    });

    it('block truth equals the mean per-pixel truth (motion is affine)', () => {
        for (const s of [{ ...defaultScenario('zoom'), scale: 1.07 }, { ...defaultScenario('rotate'), degrees: 3 }]) {
            const bx = 48, by = 16, bs = 16;
            let sx = 0, sy = 0;
            for (let y = by; y < by + bs; y++) {
                for (let x = bx; x < bx + bs; x++) {
                    const t = pixelTruth(s, 128, 96, x, y);
                    sx += t.x;
                    sy += t.y;
                }
            }
            const b = blockTruth(s, 128, 96, bx, by, bs, 32);
            expect(b.excluded).toBe(false);
            expect(b.dx).toBeCloseTo(sx / (bs * bs), 9);
            expect(b.dy).toBeCloseTo(sy / (bs * bs), 9);
        }
    });

    it('rotation renders by sampling the reference at srcOf', () => {
        // 90 degrees about the centre of a 5x5 image maps integer pixels to integer pixels.
        const img = coordImage(5, 5);
        const s = { ...defaultScenario('rotate'), degrees: 90 };
        const { reference, current } = renderPair(img, s);
        for (let y = 0; y < 5; y++) {
            for (let x = 0; x < 5; x++) {
                const src = srcOf(s, 5, 5, x, y);
                expect(px(current, x, y)).toEqual(px(reference, Math.round(src.x), Math.round(src.y)));
            }
        }
    });
});

describe('moving object', () => {
    const W = 200, H = 160;
    const s = { ...defaultScenario('object'), dx: 8, dy: 4 };
    const { source, from } = objectLayout(W, H);

    it('shows the patch at its old position in the reference and moved in the current frame', () => {
        const img = coordImage(W, H);
        const { reference, current } = renderPair(img, s);
        expect(px(reference, from.x + 3, from.y + 2)).toEqual(px(img, source.x + 3, source.y + 2));
        expect(px(current, from.x + 8 + 3, from.y + 4 + 2)).toEqual(px(img, source.x + 3, source.y + 2));
        // Background away from the object is unchanged.
        expect(px(current, 2, H - 2)).toEqual(px(img, 2, H - 2));
    });

    it('blocks inside the moved object have truth -v; background blocks 0', () => {
        const inside = blockTruth(s, W, H, from.x + 8 + 8, from.y + 4 + 8, 8, 16);
        expect(inside).toEqual({ excluded: false, dx: -8, dy: -4 });
        expect(blockTruth(s, W, H, 0, H - 16, 16, 16)).toEqual({ excluded: false, dx: 0, dy: 0 });
    });

    it('excludes object edges and revealed background', () => {
        // Straddles the right edge of the moved object.
        const edgeX = from.x + 8 + from.w - 4;
        expect(blockTruth(s, W, H, edgeX, from.y + 4 + 8, 8, 16)).toEqual({ excluded: true, reason: 'boundary' });
        // Top-left of the old position is revealed background.
        expect(blockTruth(s, W, H, from.x, from.y, 4, 16)).toEqual({ excluded: true, reason: 'occluded' });
        expect(srcOf(s, W, H, from.x, from.y)).toBeNull();
    });
});

describe('noise', () => {
    it('is reproducible for a seed and changes with the seed', () => {
        const img = coordImage(16, 16);
        const a = renderPair(img, pan(0, 0, { noise: 5, seed: 7 })).current;
        const b = renderPair(img, pan(0, 0, { noise: 5, seed: 7 })).current;
        const c = renderPair(img, pan(0, 0, { noise: 5, seed: 8 })).current;
        expect(Array.from(a.data)).toEqual(Array.from(b.data));
        expect(Array.from(a.data)).not.toEqual(Array.from(c.data));
    });

    it('zero noise with zero motion reproduces the image', () => {
        const img = coordImage(16, 16);
        expect(Array.from(renderPair(img, pan(0, 0)).current.data)).toEqual(Array.from(img.data));
    });
});
