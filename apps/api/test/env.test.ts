import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';

const apiRoot = path.resolve(import.meta.dirname, '..');

const SECRET_VALUES = {
  databasePassword: 'hunter2-db-password',
  secretKey: 'sk_test_super_secret_value',
  publishableKey: 'pk_test_publishable_value',
};

const validEnv: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '0',
  LOG_LEVEL: 'silent',
  WEB_ORIGINS: 'http://localhost:3001',
  DATABASE_URL: `postgresql://omni:${SECRET_VALUES.databasePassword}@127.0.0.1:1/omni`,
  CLERK_SECRET_KEY: SECRET_VALUES.secretKey,
  CLERK_PUBLISHABLE_KEY: SECRET_VALUES.publishableKey,
};

function startApi(env: Record<string, string | undefined>) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: apiRoot,
    env: { PATH: process.env.PATH, ...env },
    encoding: 'utf8',
    timeout: 20_000,
  });
  return { status: result.status, output: `${result.stdout}\n${result.stderr}`, stderr: result.stderr };
}

function expectNoSecrets(output: string): void {
  for (const value of Object.values(SECRET_VALUES))
    expect(output).not.toContain(value);
}

describe('fail-fast configuration', { timeout: 20_000 }, () => {
  it('refuses to start without CLERK_SECRET_KEY', () => {
    const { status, stderr, output } = startApi({ ...validEnv, CLERK_SECRET_KEY: undefined });

    expect(status).not.toBe(0);
    expect(stderr).toContain('CLERK_SECRET_KEY');
    expectNoSecrets(output);
  });

  it('treats an empty CLERK_SECRET_KEY as missing', () => {
    const { status, stderr } = startApi({ ...validEnv, CLERK_SECRET_KEY: '' });

    expect(status).not.toBe(0);
    expect(stderr).toContain('CLERK_SECRET_KEY');
  });

  it('refuses to start when WEB_ORIGINS is not a URL', () => {
    const { status, stderr, output } = startApi({ ...validEnv, WEB_ORIGINS: 'not-a-url' });

    expect(status).not.toBe(0);
    expect(stderr).toContain('WEB_ORIGINS');
    expect(output).not.toContain('not-a-url');
    expectNoSecrets(output);
  });
});
