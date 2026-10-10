import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Guards against declaring a WASM function in TypeScript that the Emscripten
// build never exports (which only fails at runtime with "is not a function").
// A function is exported if it is listed in the Makefile's WEB_EXPORTS
// or marked EMSCRIPTEN_KEEPALIVE in codec_web.cpp.
// Vitest runs from web/, so the repo root is one level up.
const root = resolve(process.cwd(), '..') + '/';
const makefile = readFileSync(root + 'Makefile', 'utf8');
const dts = readFileSync(root + 'web/src/types/wasm.d.ts', 'utf8');
const cpp = readFileSync(root + 'web/cpp/codec_web.cpp', 'utf8');

// WEB_EXPORTS = _a _b \
//               _c ...
const webExports = makefile.match(/^WEB_EXPORTS\s*=((?:.*\\\n)*.*)$/m)[1];
const exported = new Set(webExports.match(/_\w+/g));
const declared = [...dts.matchAll(/^\s+(_\w+)\(/gm)].map(m => m[1]);
const keepalive = [...cpp.matchAll(/EMSCRIPTEN_KEEPALIVE\s+[\w\s*]+?\b(\w+)\s*\(/g)].map(m => '_' + m[1]);

describe('WASM exports', () => {
    it('finds declarations to check', () => {
        expect(declared.length).toBeGreaterThan(0);
        expect(keepalive.length).toBeGreaterThan(0);
    });

    it.each(declared)('%s declared in wasm.d.ts is exported by the build', (fn) => {
        expect(exported.has(fn) || keepalive.includes(fn)).toBe(true);
    });
});
