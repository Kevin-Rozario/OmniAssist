import { describe, expect, it, vi } from 'vitest';
import { buildTestApp } from './harness';

describe('/api/health', () => {
  it('returns 200 without touching the database', async () => {
    const pingDatabase = vi.fn(async () => {});
    const { app } = buildTestApp({ pingDatabase });
    const res = await app.request('/api/health');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
    expect(pingDatabase).not.toHaveBeenCalled();
  });
});

describe('/api/ready', () => {
  it('returns 200 when the database answers', async () => {
    const pingDatabase = vi.fn(async () => {});
    const { app } = buildTestApp({ pingDatabase });
    const res = await app.request('/api/ready');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: 'ok',
      checks: { database: 'ok' },
    });
    expect(pingDatabase).toHaveBeenCalledOnce();
  });

  it('returns 503 when the database query fails', async () => {
    const { app, log } = buildTestApp({
      pingDatabase: async () => {
        throw new Error('connection refused');
      },
    });
    const res = await app.request('/api/ready');

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      status: 'unavailable',
      checks: { database: 'unavailable' },
    });
    expect(log.entries().some(entry => entry.msg === 'readiness check failed: database')).toBe(true);
  });

  it('returns 503 when the database does not answer within the timeout', async () => {
    vi.useFakeTimers();
    try {
      let aborted = false;
      const { app } = buildTestApp({
        pingDatabase: signal => new Promise<void>(() => {
          signal.addEventListener('abort', () => {
            aborted = true;
          });
        }),
      });

      const pending = app.request('/api/ready');
      await vi.advanceTimersByTimeAsync(2000);
      const res = await pending;

      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({
        status: 'unavailable',
        checks: { database: 'unavailable' },
      });
      expect(aborted).toBe(true);
    }
    finally {
      vi.useRealTimers();
    }
  });

  it('is still ok just under the 2-second budget', async () => {
    vi.useFakeTimers();
    try {
      const { app } = buildTestApp({
        pingDatabase: () => new Promise<void>(resolve => setTimeout(resolve, 1900)),
      });

      const pending = app.request('/api/ready');
      await vi.advanceTimersByTimeAsync(1900);
      expect((await pending).status).toBe(200);
    }
    finally {
      vi.useRealTimers();
    }
  });
});
