import { describe, expect, it } from 'vitest';
import { buildTestApp } from './harness';

const UUID_V7 = /^[\da-f]{8}-[\da-f]{4}-7[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/;

describe('request ID', () => {
  it('echoes a supplied ID', async () => {
    const { app, log } = buildTestApp();
    const res = await app.request('/health', {
      headers: { 'X-Request-Id': 'abc-123' },
    });

    expect(res.headers.get('X-Request-Id')).toBe('abc-123');
    expect(log.entries().every(entry => entry.requestId === 'abc-123')).toBe(true);
  });

  it('generates a UUID v7 when none is supplied', async () => {
    const { app } = buildTestApp();
    const res = await app.request('/health');

    expect(res.headers.get('X-Request-Id')).toMatch(UUID_V7);
  });

  it.each([
    ['contains disallowed characters', 'abc 123; drop'],
    [
      'is longer than 64 characters',
      'a'.repeat(65),
    ],
  ])('replaces an ID that %s', async (_, invalid) => {
    const { app } = buildTestApp();
    const res = await app.request('/health', {
      headers: { 'X-Request-Id': invalid },
    });

    expect(res.headers.get('X-Request-Id')).toMatch(UUID_V7);
  });

  it('is included on error responses', async () => {
    const { app } = buildTestApp();
    const res = await app.request('/nope', {
      headers: { 'X-Request-Id': 'err-1' },
    });

    expect(res.headers.get('X-Request-Id')).toBe('err-1');
  });
});

describe('access log', () => {
  it('writes one JSON line with method, path, status, duration and request ID', async () => {
    const { app, log } = buildTestApp();
    await app.request('/health', {
      headers: { 'X-Request-Id': 'log-1' },
    });

    const access = log.entries().filter(entry => entry.msg === 'request completed');
    expect(access).toHaveLength(1);
    expect(access[0]).toMatchObject({
      level: 'info',
      method: 'GET',
      path: '/health',
      status: 200,
      requestId: 'log-1',
    });
    expect(access[0]?.durationMs).toEqual(expect.any(Number));
    expect(access[0]?.time).toEqual(expect.any(String));
  });

  it('never writes the bearer token value', async () => {
    const token = 'eyJhbGciOiJSUzI1NiJ9.super-secret-session-token';
    const { app, log } = buildTestApp();
    const res = await app.request('/health', {
      headers: { 'Authorization': `Bearer ${token}`, 'X-Request-Id': 'tok-1' },
    });

    expect(res.status).toBe(200);
    expect(log.lines.some(line => line.includes('tok-1'))).toBe(true);
    expect(log.lines.join('\n')).not.toContain(token);
  });

  it('redacts token, secret and authorization fields logged by application code', () => {
    const { logger, lines } = buildTestApp().log;
    logger.info({
      headers: { authorization: 'Bearer abc', cookie: '__session=xyz' },
      sessionToken: 'tok-value',
      nested: { clientSecret: 'shh', keep: 'visible' },
    }, 'debug context');

    const line = lines.join('\n');
    for (const value of [
      'Bearer abc',
      '__session=xyz',
      'tok-value',
      'shh',
    ])
      expect(line).not.toContain(value);
    expect(line).toContain('visible');
  });
});
