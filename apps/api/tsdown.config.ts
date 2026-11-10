import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node24',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  dts: false,
  outExtensions: () => ({ js: '.js' }),
  // Workspace packages ship TypeScript source, so they must be bundled.
  deps: {
    alwaysBundle: [/^@omni\//],
  },
});
