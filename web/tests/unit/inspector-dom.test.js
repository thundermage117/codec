import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { INSPECTOR_IDS } from '../../src/lib/inspector-dom.js';

// The Block Inspector's imperative code finds its elements by ID and skips
// missing ones silently, so a renamed element would just stop updating.
// These checks turn that into a test failure (see src/lib/inspector-dom.ts).
// Vitest runs from web/.
const src = join(process.cwd(), 'src');

function filesUnder(dir, ext) {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return filesUnder(path, ext);
        return path.endsWith(ext) ? [path] : [];
    });
}

const renderedIds = new Set(
    filesUnder(src, '.svelte').flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/\bid="([A-Za-z][\w-]*)"/g)].map((m) => m[1]))
);

const ids = Object.values(INSPECTOR_IDS);

// IDs that lib code creates itself (in generated HTML) and then looks up.
const CREATED_BY_LIB = ['expandAllCosts', 'collapseAllCosts'];

const libSources = filesUnder(join(src, 'lib'), '.ts')
    .filter((f) => !f.endsWith('inspector-dom.ts'))
    .map((f) => ({ file: f.slice(src.length + 1), text: readFileSync(f, 'utf8') }));

describe('inspector element IDs', () => {
    it.each(ids)('#%s is rendered by a component', (id) => {
        expect(renderedIds.has(id)).toBe(true);
    });

    it('lib code refers to inspector IDs only through INSPECTOR_IDS', () => {
        const literals = libSources.flatMap(({ file, text }) =>
            ids.filter((id) => new RegExp(`['"\`]${id}['"\`]`).test(text)).map((id) => `${file}: '${id}'`));
        expect(literals).toEqual([]);
    });

    it('lib code looks up no element IDs outside INSPECTOR_IDS', () => {
        const lookup = /getElementById\(\s*['"`]([^'"`]+)['"`]|querySelector(?:All)?\(\s*['"`]#([\w-]+)/g;
        const strays = libSources.flatMap(({ file, text }) =>
            [...text.matchAll(lookup)]
                .map((m) => m[1] ?? m[2])
                .filter((id) => !CREATED_BY_LIB.includes(id))
                .map((id) => `${file}: #${id}`));
        expect(strays).toEqual([]);
    });
});
