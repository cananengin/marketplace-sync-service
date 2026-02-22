import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.integration.test.ts'],
    testTimeout: 30000,
    // Run one test file at a time to avoid DB conflicts between api and database tests
    fileParallelism: false,
    // Within a file, run tests sequentially
    maxConcurrency: 1,
  },
});
