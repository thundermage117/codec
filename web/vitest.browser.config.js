import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'node:path';
import { existsSync } from 'node:fs';

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
    publicDir: false, // public/ is a static asset dir — disable it so test imports resolve cleanly
    test: {
        browser: {
            enabled: true,
            provider: 'playwright',
            name: 'chromium',
            headless: true,
            providerOptions: {
                launch: {
                    args: ['--no-sandbox', '--disable-setuid-sandbox'],
                },
            },
        },
        setupFiles: ['./tests/setup/browser.setup.js'],
        include: ['tests/browser/**/*.browser.test.js'],
        globals: true,
    },
});
