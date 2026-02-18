import { defineConfig } from 'vitest/config';

export default defineConfig({
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
