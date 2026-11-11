import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { afterEach, describe, expect, it, vi } from 'vitest';

const apiRoot = path.resolve(import.meta.dirname, '..');

const SECRET_VALUES = {
  databasePassword: 'hunter2-db-password',
  secretKey: 'sk_test_super_secret_value',
  publishableKey: 'pk_test_publishable_value',
  r2Secret: 'r2_secret_access_key_value',
  pineconeKey: 'pinecone_api_key_value',
  inngestSigning: 'signkey-inngest_secret_value',
  inngestEvent: 'inngest_event_key_value',
  openaiKey: 'sk-openai_api_key_value',
  typesafeKey: 'typesafe_api_key_value',
  tavilyKey: 'tvly-tavily_api_key_value',
};

const validEnv: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '0',
  LOG_LEVEL: 'silent',
  WEB_ORIGINS: 'http://localhost:3001',
  DATABASE_URL: `postgresql://omni:${SECRET_VALUES.databasePassword}@127.0.0.1:1/omni`,
  CLERK_SECRET_KEY: SECRET_VALUES.secretKey,
  CLERK_PUBLISHABLE_KEY: SECRET_VALUES.publishableKey,
  R2_ACCOUNT_ID: 'test-account',
  R2_ACCESS_KEY_ID: 'test-access-key',
  R2_SECRET_ACCESS_KEY: SECRET_VALUES.r2Secret,
  R2_BUCKET: 'omniassist-kb',
  PINECONE_API_KEY: SECRET_VALUES.pineconeKey,
  PINECONE_INDEX: 'omniassist-kb',
  INNGEST_SIGNING_KEY: SECRET_VALUES.inngestSigning,
  INNGEST_EVENT_KEY: SECRET_VALUES.inngestEvent,
  OPENAI_API_KEY: SECRET_VALUES.openaiKey,
  OPENAI_ANSWER_MODEL: 'answer-model-test',
  TYPESAFE_API_KEY: SECRET_VALUES.typesafeKey,
  TAVILY_API_KEY: SECRET_VALUES.tavilyKey,
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

  it('refuses to start without R2_BUCKET', () => {
    const { status, stderr, output } = startApi({ ...validEnv, R2_BUCKET: undefined });

    expect(status).not.toBe(0);
    expect(stderr).toContain('R2_BUCKET');
    expectNoSecrets(output);
  });

  it('refuses to start without PINECONE_API_KEY', () => {
    const { status, stderr, output } = startApi({ ...validEnv, PINECONE_API_KEY: undefined });

    expect(status).not.toBe(0);
    expect(stderr).toContain('PINECONE_API_KEY');
    expectNoSecrets(output);
  });

  it.each([
    'OPENAI_API_KEY',
    'OPENAI_ANSWER_MODEL',
    'TYPESAFE_API_KEY',
    'TAVILY_API_KEY',
  ])('refuses to start without %s, naming it and printing no secret', (name) => {
    const { status, stderr, output } = startApi({ ...validEnv, [name]: undefined });

    expect(status).not.toBe(0);
    expect(stderr).toContain(name);
    expectNoSecrets(output);
  });

  it('treats an empty OPENAI_ANSWER_MODEL as missing', () => {
    const { status, stderr } = startApi({ ...validEnv, OPENAI_ANSWER_MODEL: '' });

    expect(status).not.toBe(0);
    expect(stderr).toContain('OPENAI_ANSWER_MODEL');
  });

  it.each([
    ['KB_RETRIEVAL_TOP_K', '0'],
    ['KB_RETRIEVAL_TOP_K', '21'],
    ['KB_RETRIEVAL_TOP_K', 'many'],
    ['ASK_TIMEOUT_MS', '0'],
    ['ASK_TIMEOUT_MS', 'soon'],
  ])('refuses to start when %s is %s', (name, value) => {
    const { status, stderr, output } = startApi({ ...validEnv, [name]: value });

    expect(status).not.toBe(0);
    expect(stderr).toContain(name);
    expectNoSecrets(output);
  });
});

describe('ask configuration defaults', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function loadEnv(overrides: Record<string, string> = {}) {
    vi.resetModules();
    for (const [name, value] of Object.entries({
      ...validEnv,
      PORT: '3000',
      ...overrides,
    }))
      vi.stubEnv(name, value);
    return (await import('../src/env')).env;
  }

  it('applies the documented defaults for the optional variables', async () => {
    const env = await loadEnv();

    expect(env.TYPESAFE_MODEL).toBe('jev-1.14.0');
    expect(env.KB_RETRIEVAL_TOP_K).toBe(8);
    expect(env.ASK_TIMEOUT_MS).toBe(60_000);
  });

  it('uses the model id with no default for answers', async () => {
    const env = await loadEnv({ OPENAI_ANSWER_MODEL: 'answer-model-xyz' });

    expect(env.OPENAI_ANSWER_MODEL).toBe('answer-model-xyz');
  });

  it('lets the optional variables be overridden and coerces numbers', async () => {
    const env = await loadEnv({
      TYPESAFE_MODEL: 'jev-9.9.9',
      KB_RETRIEVAL_TOP_K: '5',
      ASK_TIMEOUT_MS: '15000',
    });

    expect(env.TYPESAFE_MODEL).toBe('jev-9.9.9');
    expect(env.KB_RETRIEVAL_TOP_K).toBe(5);
    expect(env.ASK_TIMEOUT_MS).toBe(15_000);
  });

  it('treats empty optional values as unset', async () => {
    const env = await loadEnv({ TYPESAFE_MODEL: '', KB_RETRIEVAL_TOP_K: '', ASK_TIMEOUT_MS: '' });

    expect(env.TYPESAFE_MODEL).toBe('jev-1.14.0');
    expect(env.KB_RETRIEVAL_TOP_K).toBe(8);
    expect(env.ASK_TIMEOUT_MS).toBe(60_000);
  });
});
