import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'node:path';
import { existsSync } from 'node:fs';

// Resolve *.js imports to *.ts (and *.svelte.js → *.svelte.ts) so that
// .js test files can import TypeScript source modules with the standard
// TypeScript ESM extension convention.
const resolveTsExtensions = {
    name: 'resolve-ts-extensions',
    resolveId(id, importer) {
        if (!id.startsWith('.') || !importer) return;
        if (id.endsWith('.js') || id.endsWith('.jsx')) {
            const tsPath = path.resolve(
                path.dirname(importer),
                id.slice(0, -2) + 'ts'
            );
            if (existsSync(tsPath)) return tsPath;
            const tsxPath = path.resolve(
                path.dirname(importer),
                id.slice(0, -2) + 'tsx'
            );
            if (existsSync(tsxPath)) return tsxPath;
        }
    }
};

export default defineConfig({
    plugins: [resolveTsExtensions, svelte({ hot: false })],
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./tests/setup/unit.setup.js'],
        include: ['tests/unit/**/*.test.js'],
        coverage: {
            provider: 'v8',
            include: ['src/lib/**/*.ts'],
            exclude: ['src/lib/image-manager.ts'],
            reporter: ['text', 'lcov'],
        },
    },
});
