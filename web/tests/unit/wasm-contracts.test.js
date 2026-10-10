import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ViewMode } from '../../src/lib/state.svelte.js';
import { Transform } from '../../src/lib/transforms.js';
import { COEFF_BINS } from '../../src/lib/wasm-bridge.js';
import { BLOCK_GRID } from '../../src/lib/inspection.js';

// Numbers and memory layouts shared across the WASM boundary are defined
// once in C++ and once in TypeScript. Nothing links them at compile time, so
// these tests read the C++ sources and compare. (Exported function names are
// checked in wasm-exports.test.js.) Vitest runs from web/.
const root = resolve(process.cwd(), '..') + '/';
const binding = readFileSync(root + 'web/cpp/codec_web.cpp', 'utf8');
const codecHeader = readFileSync(root + 'core/inc/ImageCodec.h', 'utf8');

describe('WASM contracts', () => {
    it('view mode numbers match codec_web.cpp ViewMode', () => {
        const body = binding.match(/enum ViewMode\s*\{([^}]*)\}/)[1];
        const cpp = Object.fromEntries([...body.matchAll(/(\w+)\s*=\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]));
        expect(cpp).toEqual({ ...ViewMode });
    });

    it('transform numbers match codec_web.cpp map_transform_mode', () => {
        const body = binding.match(/map_transform_mode\(int mode\)\s*\{([\s\S]*?)\n\}/)[1];
        const cases = Object.fromEntries([...body.matchAll(/case (\d+):\s*return ImageCodec::TransformType::(\w+)/g)]
            .map((m) => [m[2], Number(m[1])]));
        expect(body).toMatch(/default:\s*return ImageCodec::TransformType::DCT/);
        expect(cases).toEqual({ DWT_HAAR: Transform.Haar, DWT_97: Transform.CDF97 });
        expect(Transform.DCT).toBe(0);
    });

    it('chroma subsampling modes map to the matching codec setting', () => {
        const body = binding.match(/map_cs_mode\(int mode\)\s*\{([\s\S]*?)\n\}/)[1];
        for (const [, mode, cs] of body.matchAll(/case (\d+):\s*return ImageCodec::ChromaSubsampling::CS_(\d+)/g)) {
            expect(cs).toBe(mode);
        }
        expect(body).toMatch(/case 422:/);
        expect(body).toMatch(/case 420:/);
    });

    it('COEFF_BINS matches CoefficientStats::NUM_BINS', () => {
        expect(Number(codecHeader.match(/NUM_BINS\s*=\s*(\d+)/)[1])).toBe(COEFF_BINS);
    });

    it('BLOCK_GRID follows the field order of BlockDebugData', () => {
        const body = codecHeader.match(/struct BlockDebugData\s*\{([^}]*)\}/)[1];
        const fields = [...body.matchAll(/double\s+(\w+)\[8\]\[8\]/g)].map((m) => m[1]);
        expect(fields).toEqual(Object.entries(BLOCK_GRID).sort((a, b) => a[1] - b[1]).map(([name]) => name));
    });
});
