import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from './context';
import type { Logger } from './logger';
import { performance } from 'node:perf_hooks';
import { v7 as uuidv7 } from 'uuid';

export const REQUEST_ID_HEADER = 'X-Request-Id';
const ACCEPTABLE_REQUEST_ID = /^[\w-]{1,64}$/;

/** Assigns the request ID, echoes it back, and attaches a per-request child logger. */
export function requestContext(logger: Logger): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const incoming = c.req.header(REQUEST_ID_HEADER);
    const requestId = incoming && ACCEPTABLE_REQUEST_ID.test(incoming)
      ? incoming
      : uuidv7();

    c.set('requestId', requestId);
    c.set('logger', logger.child({ requestId }));
    c.set('auth', null);

    await next();
    c.header(REQUEST_ID_HEADER, requestId);
  };
}

export function accessLog(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const start = performance.now();
    await next();
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    const status = c.res.status;
    const level = status >= 500
      ? 'error'
      : status >= 400
        ? 'warn'
        : 'info';
    c.var.logger[level]({
      method: c.req.method,
      path: c.req.path,
      status,
      durationMs,
    }, 'request completed');
  };
}
