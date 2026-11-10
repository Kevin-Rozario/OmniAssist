import { fileURLToPath } from 'node:url';
import { vitestPreset } from '@omni/config/vitest-preset';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  ...vitestPreset({
    setupFiles: ['./src/test-setup.ts'],
  }),
});
