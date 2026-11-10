import type { ViteUserConfig } from 'vitest/config';

export function vitestPreset(overrides: ViteUserConfig['test'] = {}): ViteUserConfig {
  return {
    test: {
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'test/**/*.test.ts'],
      environment: 'node',
      restoreMocks: true,
      unstubEnvs: true,
      passWithNoTests: true,
      ...overrides,
    },
  };
}
