import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});
