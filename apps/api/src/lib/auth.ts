import type { Role } from '@omni/types';
import type { MiddlewareHandler } from 'hono';
import type { AppEnv, AuthSession } from './context';
import { clerkMiddleware, getAuth } from '@clerk/hono';
import { createMiddleware } from 'hono/factory';
import { ForbiddenError, UnauthenticatedError } from './errors';

/**
 * Resolves the caller's session, or `null` when the request is not authenticated.
 * Production uses Clerk; tests substitute a fake keyed on fake tokens.
 */
export type AuthVerifier = MiddlewareHandler<AppEnv>;

export function roleFromClaims(claims: unknown): Role {
  const metadata = (claims as { metadata?: { role?: unknown } } | null | undefined)?.metadata;
  return metadata?.role === 'admin'
    ? 'admin'
    : 'member';
}

export interface ClerkVerifierOptions {
  secretKey: string;
  publishableKey: string;
  authorizedParties: string[];
}

export function clerkVerifier(options: ClerkVerifierOptions): AuthVerifier {
  const clerk = clerkMiddleware(options);
  return async (c, next) =>
    clerk(c, async () => {
      const auth = getAuth(c);
      if (auth.isAuthenticated && auth.userId) {
        const session: AuthSession = {
          userId: auth.userId,
          role: roleFromClaims(auth.sessionClaims),
        };
        c.set('auth', session);
        c.set('logger', c.var.logger.child({ userId: session.userId }));
      }
      await next();
    });
}

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.var.auth)
    throw new UnauthenticatedError();
  await next();
});

export function requireRole(role: Role): MiddlewareHandler<AppEnv> {
  return createMiddleware<AppEnv>(async (c, next) => {
    if (!c.var.auth)
      throw new UnauthenticatedError();
    if (c.var.auth.role !== role)
      throw new ForbiddenError();
    await next();
  });
}

export function currentSession(c: { var: { auth: AuthSession | null } }): AuthSession {
  if (!c.var.auth)
    throw new UnauthenticatedError();
  return c.var.auth;
}
