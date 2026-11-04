import preact from '@preact/preset-vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [preact()],
  resolve: {
    alias: {
      '@quickquest/protocol': new URL('./packages/protocol/src', import.meta.url).pathname,
      '@quickquest/motion': new URL('./packages/motion/src', import.meta.url).pathname,
      '@quickquest/ui': new URL('./packages/ui/src', import.meta.url).pathname,
      '@quickquest/games': new URL('./games', import.meta.url).pathname,
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.{ts,tsx}', 'games/test/**/*.test.ts', 'apps/web/src/**/*.test.{ts,tsx}'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['packages/protocol/src/**', 'packages/motion/src/**', 'packages/ui/src/i18n/**', 'packages/ui/src/palette.ts', 'games/registry.ts'],
      thresholds: { lines: 80, functions: 80, branches: 75 },
    },
  },
});
