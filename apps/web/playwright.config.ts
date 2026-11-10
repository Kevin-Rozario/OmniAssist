import process from 'node:process';
import { defineConfig, devices } from '@playwright/test';
import { apiUrl } from './e2e/api-url';

try {
  process.loadEnvFile('.env.local');
}
catch {
  // Signed-in tests skip when local Clerk keys are absent.
}

const port = 3001;
const baseURL = `http://localhost:${port}`;

// The dev server has to boot when Clerk CI secrets are absent.
// Fallbacks are applied only to that process. An empty CLERK_SECRET_KEY in
// this process still skips the signed-in test.
const serverEnv = {
  NEXT_PUBLIC_API_URL: apiUrl(),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || 'pk_test_Y2xlcmsua2V2aW5yb3phcmlvLmNvbSQ',
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY || 'sk_test_ci_placeholder',
};

const webServerCommand = [
  ...Object.entries(serverEnv).map(([key, value]) => `${key}=${JSON.stringify(value)}`),
  'pnpm exec next dev',
  '--port',
  String(port),
].join(' ');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: webServerCommand,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
