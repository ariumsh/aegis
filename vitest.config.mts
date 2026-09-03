import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['tests/**/*.test.ts'],
        environment: 'node',
        // These are unit tests over pure logic and mocked boundaries. Nothing
        // here reaches Discord, PostgreSQL or Redis, so the suite runs anywhere
        // without infrastructure.
        globals: false
    }
});
