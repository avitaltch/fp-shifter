import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 75,
        functions: 75,
        branches: 75,
        statements: 75
      },
      exclude: [
        'src/test/**',
        'src/main.jsx',
        'playwright.config.js',
        'e2e/**',
        '**/*.cjs',
        '**/*.test.jsx',
      ]
    },
    include: ['src/**/*.{test,spec}.{js,jsx}']
  }
});
