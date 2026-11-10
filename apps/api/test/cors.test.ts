import { describe, expect, it } from 'vitest';
import { buildTestApp, WEB_ORIGIN } from './harness';

function preflight(origin: string) {
  return {
    method: 'OPTIONS',
    headers: {
      'Origin': origin,
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'authorization, content-type, x-request-id',
    },
  };
}

describe('cors', () => {
  it('allows a preflight from the configured web origin', async () => {
    const { app } = buildTestApp();
    const res = await app.request('/v1/me', preflight(WEB_ORIGIN));

    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(WEB_ORIGIN);
    const allowed = res.headers.get('Access-Control-Allow-Headers')?.toLowerCase() ?? '';
    for (const header of ['authorization', 'content-type', 'x-request-id'])
      expect(allowed).toContain(header);
  });

  it('does not grant access to another origin', async () => {
    const { app } = buildTestApp();
    const res = await app.request('/v1/me', preflight('https://evil.example'));

    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('exposes X-Request-Id to the browser on actual requests', async () => {
    const { app } = buildTestApp();
    const res = await app.request('/health', {
      headers: { Origin: WEB_ORIGIN },
    });

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(WEB_ORIGIN);
    expect(res.headers.get('Access-Control-Expose-Headers')).toContain('X-Request-Id');
  });
});
