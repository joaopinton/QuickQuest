import preact from '@preact/preset-vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [preact()],
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
