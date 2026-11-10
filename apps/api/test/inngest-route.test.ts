import { ProblemDetailsSchema } from '@omni/types';
import { describe, expect, it } from 'vitest';
import { problemType } from '../src/lib/errors';
import { buildTestApp, fakeVerifier } from './harness';

describe('/api/inngest', () => {
  it('is reachable without a Clerk token while /v1/documents stays protected', async () => {
    const { app } = buildTestApp({
      verifier: fakeVerifier({
        'admin-token': { userId: 'user_admin', role: 'admin' },
      }),
      inngestHandler: async c => c.json({ ok: true }, 200),
    });

    const jobs = await app.request('/api/inngest');
    expect(jobs.status).toBe(200);
    expect(await jobs.json()).toEqual({ ok: true });

    const documents = await app.request('/v1/documents');
    expect(documents.status).toBe(401);
    expect(ProblemDetailsSchema.parse(await documents.json())).toMatchObject({
      type: problemType.unauthenticated,
      status: 401,
    });
  });
});
