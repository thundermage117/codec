// Synthetic frame pairs with known motion, for teaching motion estimation.
//
// Convention (matches the WASM motion estimator): a motion vector (dx, dy)
// for a pixel/block at p in the current frame points to p + (dx, dy) in the
// reference frame. For every scenario we define srcOf(p): where the current
// pixel p comes from in the reference. The current frame is rendered by
// sampling the reference at srcOf(p), and the ground truth is srcOf(p) - p,
// so the rendered motion and the truth cannot disagree in sign.
//
// Example: content that moves right by 5 px has ground truth dx = -5.

export type Scenario =
    | { kind: 'pan'; dx: number; dy: number; noise: number; seed: number }
    | { kind: 'zoom'; scale: number; noise: number; seed: number }
    | { kind: 'rotate'; degrees: number; noise: number; seed: number }
    | { kind: 'object'; dx: number; dy: number; noise: number; seed: number };

export type ScenarioKind = Scenario['kind'];

export type ExclusionReason = 'out-of-frame' | 'out-of-range' | 'boundary' | 'occluded';

export type BlockTruth =
    | { excluded: false; dx: number; dy: number }
    | { excluded: true; reason: ExclusionReason };

export interface Rect { x: number; y: number; w: number; h: number }

export interface FramePair {
    reference: ImageData;
    current: ImageData;
}

type Point = { x: number; y: number };

export function defaultScenario(kind: ScenarioKind): Scenario {
    switch (kind) {
        case 'pan': return { kind, dx: 6, dy: -3, noise: 0, seed: 1 };
        case 'zoom': return { kind, scale: 1.04, noise: 0, seed: 1 };
        case 'rotate': return { kind, degrees: 2, noise: 0, seed: 1 };
        case 'object': return { kind, dx: 10, dy: 6, noise: 0, seed: 1 };
    }
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

function centre(w: number, h: number): Point {
    return { x: (w - 1) / 2, y: (h - 1) / 2 };
}

// Moving-object layout: a patch cut from `source` is shown at `from` in the
// reference and at `from` + (dx, dy) in the current frame.
export function objectLayout(w: number, h: number): { source: Rect; from: Rect } {
    const ow = Math.max(8, Math.round(w * 0.22));
    const oh = Math.max(8, Math.round(h * 0.3));
    return {
        source: { x: Math.round(w * 0.08), y: Math.round(h * 0.12), w: ow, h: oh },
        from: { x: Math.round(w * 0.45), y: Math.round(h * 0.35), w: ow, h: oh },
    };
}

function inRect(r: Rect, x: number, y: number): boolean {
    return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

function movedRect(s: { dx: number; dy: number }, r: Rect): Rect {
    return { x: r.x + s.dx, y: r.y + s.dy, w: r.w, h: r.h };
}

// Where current-frame pixel (x, y) comes from in the reference, or null if it
// has no source there (background revealed by a moving object).
export function srcOf(s: Scenario, w: number, h: number, x: number, y: number): Point | null {
    switch (s.kind) {
        case 'pan':
            return { x: x - s.dx, y: y - s.dy };
        case 'zoom': {
            const c = centre(w, h);
            return { x: c.x + (x - c.x) / s.scale, y: c.y + (y - c.y) / s.scale };
        }
        case 'rotate': {
            const c = centre(w, h);
            const t = (-s.degrees * Math.PI) / 180;
            const px = x - c.x;
            const py = y - c.y;
            return {
                x: c.x + px * Math.cos(t) - py * Math.sin(t),
                y: c.y + px * Math.sin(t) + py * Math.cos(t),
            };
        }
        case 'object': {
            const { from } = objectLayout(w, h);
            if (inRect(movedRect(s, from), x, y)) return { x: x - s.dx, y: y - s.dy };
            if (inRect(from, x, y)) return null;  // occluded by the object in the reference
            return { x, y };
        }
    }
}

// Ground-truth motion of a single pixel, or null if it has no source.
export function pixelTruth(s: Scenario, w: number, h: number, x: number, y: number): Point | null {
    const src = srcOf(s, w, h, x, y);
    return src ? { x: src.x - x, y: src.y - y } : null;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function newImage(w: number, h: number): ImageData {
    // Plain object in the ImageData shape so this also works without a DOM.
    if (typeof ImageData !== 'undefined') return new ImageData(w, h);
    return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4), colorSpace: 'srgb' } as ImageData;
}

function sampleBilinear(img: ImageData, x: number, y: number, out: number[]): void {
    const w = img.width;
    const h = img.height;
    const cx = Math.min(Math.max(x, 0), w - 1);
    const cy = Math.min(Math.max(y, 0), h - 1);
    const x0 = Math.floor(cx);
    const y0 = Math.floor(cy);
    const x1 = Math.min(x0 + 1, w - 1);
    const y1 = Math.min(y0 + 1, h - 1);
    const fx = cx - x0;
    const fy = cy - y0;
    const d = img.data;
    const i00 = (y0 * w + x0) * 4;
    const i10 = (y0 * w + x1) * 4;
    const i01 = (y1 * w + x0) * 4;
    const i11 = (y1 * w + x1) * 4;
    for (let c = 0; c < 3; c++) {
        const top = d[i00 + c] + (d[i10 + c] - d[i00 + c]) * fx;
        const bottom = d[i01 + c] + (d[i11 + c] - d[i01 + c]) * fx;
        out[c] = top + (bottom - top) * fy;
    }
}

// Seeded PRNG (mulberry32) + Box-Muller, so frames are reproducible.
function gaussian(seed: number): () => number {
    let a = seed >>> 0;
    const uniform = () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return () => {
        const u = Math.max(uniform(), 1e-12);
        const v = uniform();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
}

function pastePatch(dst: ImageData, src: ImageData, from: Rect, to: Rect): void {
    for (let y = 0; y < from.h; y++) {
        for (let x = 0; x < from.w; x++) {
            const tx = to.x + x;
            const ty = to.y + y;
            if (tx < 0 || ty < 0 || tx >= dst.width || ty >= dst.height) continue;
            const si = ((from.y + y) * src.width + (from.x + x)) * 4;
            const di = (ty * dst.width + tx) * 4;
            dst.data[di] = src.data[si];
            dst.data[di + 1] = src.data[si + 1];
            dst.data[di + 2] = src.data[si + 2];
            dst.data[di + 3] = 255;
        }
    }
}

function copyImage(img: ImageData): ImageData {
    const out = newImage(img.width, img.height);
    out.data.set(img.data);
    return out;
}

// Builds the reference/current pair for a scenario from a still image.
export function renderPair(image: ImageData, s: Scenario): FramePair {
    const w = image.width;
    const h = image.height;
    let reference: ImageData;
    let current: ImageData;

    if (s.kind === 'object') {
        const { source, from } = objectLayout(w, h);
        reference = copyImage(image);
        pastePatch(reference, image, source, from);
        current = copyImage(image);
        pastePatch(current, image, source, movedRect(s, from));
    } else {
        reference = copyImage(image);
        current = newImage(w, h);
        const px = [0, 0, 0];
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const src = srcOf(s, w, h, x, y)!;
                sampleBilinear(reference, src.x, src.y, px);
                const i = (y * w + x) * 4;
                current.data[i] = Math.round(px[0]);
                current.data[i + 1] = Math.round(px[1]);
                current.data[i + 2] = Math.round(px[2]);
                current.data[i + 3] = 255;
            }
        }
    }

    if (s.noise > 0) {
        const next = gaussian(s.seed);
        const d = current.data;
        for (let i = 0; i < d.length; i += 4) {
            d[i] = d[i] + next() * s.noise;  // Uint8ClampedArray rounds and clamps
            d[i + 1] = d[i + 1] + next() * s.noise;
            d[i + 2] = d[i + 2] + next() * s.noise;
        }
    }
    return { reference, current };
}

// ---------------------------------------------------------------------------
// Ground truth per block
// ---------------------------------------------------------------------------

// True motion of the block whose top-left corner is (bx, by), or why it is
// excluded from scoring. Pan/zoom/rotate are affine, so the block's mean
// motion equals the motion at its centre.
export function blockTruth(s: Scenario, w: number, h: number,
    bx: number, by: number, bs: number, range: number): BlockTruth {
    let truth: Point;

    if (s.kind === 'object') {
        const { from } = objectLayout(w, h);
        const to = movedRect(s, from);
        let inObject = 0;
        let occluded = 0;
        for (let y = by; y < by + bs; y++) {
            for (let x = bx; x < bx + bs; x++) {
                if (inRect(to, x, y)) inObject++;
                else if (inRect(from, x, y)) occluded++;
            }
        }
        if (occluded > 0) return { excluded: true, reason: 'occluded' };
        if (inObject > 0 && inObject < bs * bs) return { excluded: true, reason: 'boundary' };
        truth = inObject > 0 ? { x: -s.dx, y: -s.dy } : { x: 0, y: 0 };
    } else {
        // Affine: if all four corners map inside the frame, so does the block.
        const corners: Point[] = [
            { x: bx, y: by }, { x: bx + bs - 1, y: by },
            { x: bx, y: by + bs - 1 }, { x: bx + bs - 1, y: by + bs - 1 },
        ];
        for (const c of corners) {
            const src = srcOf(s, w, h, c.x, c.y)!;
            if (src.x < 0 || src.y < 0 || src.x > w - 1 || src.y > h - 1) {
                return { excluded: true, reason: 'out-of-frame' };
            }
        }
        truth = pixelTruth(s, w, h, bx + (bs - 1) / 2, by + (bs - 1) / 2)!;
    }

    // The integer search cannot represent a vector beyond the window.
    if (Math.abs(Math.round(truth.x)) > range || Math.abs(Math.round(truth.y)) > range) {
        return { excluded: true, reason: 'out-of-range' };
    }
    return { excluded: false, dx: truth.x, dy: truth.y };
}
