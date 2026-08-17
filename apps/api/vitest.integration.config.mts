import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['test/**/*.integration.spec.ts'],
    clearMocks: true,
    restoreMocks: true,
    sequence: { concurrent: false },
  },
});
