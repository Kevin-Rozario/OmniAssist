import { describe, expect, it } from 'vitest';
import { buildTestApp } from './harness';

describe('api documentation', () => {
  it('serves an OpenAPI 3.1 document that describes /v1/me', async () => {
    const { app } = buildTestApp();
    const res = await app.request('/openapi.json');

    expect(res.status).toBe(200);
    const doc = await res.json() as {
      openapi: string;
      paths: Record<string, { get?: { responses: Record<string, { content?: Record<string, unknown> }> } }>;
    };
    expect(doc.openapi).toMatch(/^3\.1/);

    const responses = doc.paths['/v1/me']?.get?.responses;
    expect(responses).toBeDefined();
    expect(Object.keys(responses ?? {})).toEqual(expect.arrayContaining(['200', '401']));
    expect(responses?.['401']?.content).toHaveProperty(['application/problem+json']);
  });

  it('serves the interactive reference at /docs', async () => {
    const { app } = buildTestApp();
    const res = await app.request('/docs');

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    expect(await res.text()).toContain('/openapi.json');
  });

  it('keeps operational endpoints outside the /v1 prefix', async () => {
    const { app } = buildTestApp();
    const doc = await (await app.request('/openapi.json')).json() as { paths: Record<string, unknown> };

    expect(Object.keys(doc.paths)).toEqual(expect.arrayContaining(['/health', '/ready', '/v1/me']));
    expect((await app.request('/v1/health')).status).not.toBe(200);
  });
});
