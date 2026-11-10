import type { AuthSession } from '../src/lib/context';
import { clerkMiddleware, getAuth } from '@clerk/hono';
import { ProblemDetailsSchema } from '@omni/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clerkVerifier, currentSession, requireRole, roleFromClaims } from '../src/lib/auth';
import { problemType } from '../src/lib/errors';
import { buildTestApp, fakeVerifier } from './harness';

vi.mock('@clerk/hono', () => ({
  clerkMiddleware: vi.fn(() => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  }),
  getAuth: vi.fn(),
}));

const clerkOptions = {
  secretKey: 'sk_test_example',
  publishableKey: 'pk_test_example',
  authorizedParties: ['http://localhost:3001', 'https://app.example.com'],
};

function appWithAdminRoute(sessions: Parameters<typeof fakeVerifier>[0]) {
  const harness = buildTestApp({
    verifier: fakeVerifier(sessions),
  });
  harness.app.get('/v1/admin-check', requireRole('admin'), (c) => {
    return c.json({ userId: currentSession(c).userId }, 200);
  });
  return harness;
}

async function readProblem(res: Response) {
  expect(res.headers.get('Content-Type')).toBe('application/problem+json');
  return ProblemDetailsSchema.parse(await res.json());
}

describe('role from session claims', () => {
  it('treats only metadata.role "admin" as admin', () => {
    expect(roleFromClaims({
      metadata: { role: 'admin' },
    })).toBe('admin');
    expect(roleFromClaims({
      metadata: { role: 'member' },
    })).toBe('member');
    expect(roleFromClaims({
      metadata: { role: 'owner' },
    })).toBe('member');
    expect(roleFromClaims({})).toBe('member');
    expect(roleFromClaims(null)).toBe('member');
  });
});

describe('clerk verifier', () => {
  beforeEach(() => {
    vi.mocked(clerkMiddleware).mockClear();
    vi.mocked(getAuth).mockReset();
  });

  it('passes authorized parties through to Clerk', () => {
    clerkVerifier(clerkOptions);

    expect(clerkMiddleware).toHaveBeenCalledWith(clerkOptions);
  });

  it('derives the session role from sessionClaims.metadata.role', async () => {
    vi.mocked(getAuth)
      .mockReturnValueOnce({
        isAuthenticated: true,
        userId: 'user_admin',
        sessionClaims: {
          metadata: { role: 'admin' },
        },
      } as unknown as ReturnType<typeof getAuth>)
      .mockReturnValueOnce({
        isAuthenticated: true,
        userId: 'user_member',
        sessionClaims: { metadata: {} },
      } as unknown as ReturnType<typeof getAuth>);

    const { app } = buildTestApp({
      verifier: clerkVerifier(clerkOptions),
    });

    const admin = await app.request('/v1/me', {
      headers: { Authorization: 'Bearer admin-token' },
    });
    const member = await app.request('/v1/me', {
      headers: { Authorization: 'Bearer member-token' },
    });

    expect(admin.status).toBe(200);
    expect(await admin.json()).toMatchObject({ userId: 'user_admin', role: 'admin' });
    expect(member.status).toBe(200);
    expect(await member.json()).toMatchObject({ userId: 'user_member', role: 'member' });
  });
});

describe('protected routes', () => {
  const sessions = {
    'expired-token': { reject: 'expired' as const },
    'wrong-party-token': { reject: 'wrong-party' as const },
    'member-token': { userId: 'user_member', role: 'member' } satisfies AuthSession,
    'admin-token': { userId: 'user_admin', role: 'admin' } satisfies AuthSession,
  };

  it('returns the same 401 problem for missing, expired and wrong-party tokens', async () => {
    const { app } = buildTestApp({
      verifier: fakeVerifier(sessions),
    });
    const requests = [
      app.request('/v1/me'),
      app.request('/v1/me', {
        headers: { Authorization: 'Bearer expired-token' },
      }),
      app.request('/v1/me', {
        headers: { Authorization: 'Bearer wrong-party-token' },
      }),
    ];

    const problems = await Promise.all(requests.map(async (pending) => {
      const res = await pending;
      expect(res.status).toBe(401);
      return readProblem(res);
    }));

    const [missing, expired, wrongParty] = problems;
    expect(missing).toMatchObject({ type: problemType.unauthenticated, title: 'Authentication required' });
    expect(expired).toMatchObject({ type: missing?.type, title: missing?.title, detail: missing?.detail });
    expect(wrongParty).toMatchObject({ type: missing?.type, title: missing?.title, detail: missing?.detail });
    expect(`${expired?.detail} ${wrongParty?.detail}`).not.toMatch(/expired|party|origin/i);
  });

  it('returns 403 for a member and 200 for an admin on an admin-only route', async () => {
    const { app } = appWithAdminRoute(sessions);

    const member = await app.request('/v1/admin-check', {
      headers: { Authorization: 'Bearer member-token' },
    });
    expect(member.status).toBe(403);
    expect(await readProblem(member)).toMatchObject({ type: problemType.forbidden, status: 403 });

    const admin = await app.request('/v1/admin-check', {
      headers: { Authorization: 'Bearer admin-token' },
    });
    expect(admin.status).toBe(200);
    expect(await admin.json()).toEqual({ userId: 'user_admin' });
  });

  it('serves health, readiness, the OpenAPI document, docs UI and Inngest without a token', async () => {
    const { app } = buildTestApp({
      inngestHandler: async c => c.json({ ok: true }, 200),
    });

    for (const path of [
      '/health',
      '/ready',
      '/openapi.json',
      '/docs',
      '/api/inngest',
    ]) {
      const res = await app.request(path);
      expect(res.status, path).not.toBe(401);
      expect(res.status, path).toBeLessThan(400);
    }
  });
});
