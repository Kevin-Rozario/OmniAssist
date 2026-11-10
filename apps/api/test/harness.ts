import type { AppDeps } from '../src/app';
import type { AuthVerifier } from '../src/lib/auth';
import type { AuthSession } from '../src/lib/context';
import { Writable } from 'node:stream';
import { createApp } from '../src/app';
import { createLogger } from '../src/lib/logger';

export const WEB_ORIGIN = 'http://localhost:3001';

export function captureLogger() {
  const lines: string[] = [];
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(...String(chunk).split('\n').filter(Boolean));
      callback();
    },
  });
  const logger = createLogger({ level: 'debug', destination });
  return {
    logger,
    lines,
    entries: () => lines.map(line => JSON.parse(line) as Record<string, unknown>),
  };
}

export type FakeToken = AuthSession | { reject: 'expired' | 'wrong-party' };

/** A stand-in for Clerk: only listed sessions authenticate. Rejected tokens stay anonymous. */
export function fakeVerifier(sessions: Record<string, FakeToken> = {}): AuthVerifier {
  return async (c, next) => {
    const header = c.req.header('Authorization');
    const token = header?.startsWith('Bearer ')
      ? header.slice('Bearer '.length)
      : undefined;
    const session = token ? sessions[token] : undefined;
    if (session && !('reject' in session)) {
      c.set('auth', session);
      c.set('logger', c.var.logger.child({ userId: session.userId }));
    }
    await next();
  };
}

export function buildTestApp(overrides: Partial<AppDeps> = {}) {
  const log = captureLogger();
  const app = createApp({
    logger: log.logger,
    webOrigins: [WEB_ORIGIN],
    verifier: fakeVerifier(),
    meService: {
      getMe: async session => ({
        userId: session.userId,
        displayName: 'Test User',
        primaryEmail: null,
        role: session.role,
      }),
    },
    pingDatabase: async () => {},
    ...overrides,
  });
  return { app, log };
}
