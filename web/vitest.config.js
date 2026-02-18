import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./tests/setup/unit.setup.js'],
        include: ['tests/unit/**/*.test.js'],
        coverage: {
            provider: 'v8',
            include: ['public/js/**/*.js'],
            exclude: ['public/js/main.js'],
            reporter: ['text', 'lcov'],
        },
    },
});
