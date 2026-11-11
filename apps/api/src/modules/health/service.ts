import type { Logger } from '../../lib/logger';
import type { DependencyStatus, ReadinessResponse } from './schemas';

const READINESS_TIMEOUT_MS = 2000;

/** Resolves when the database answers a trivial query; rejects otherwise. */
export type DatabasePing = (signal: AbortSignal) => Promise<void>;

async function check(ping: DatabasePing, timeoutMs: number, logger: Logger): Promise<DependencyStatus> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`database ping timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    await Promise.race([
      ping(controller.signal),
      timeout,
    ]);
    return 'ok';
  }
  catch (error) {
    logger.warn({ err: error }, 'readiness check failed: database');
    return 'unavailable';
  }
  finally {
    clearTimeout(timer);
  }
}

export async function checkReadiness(
  ping: DatabasePing,
  logger: Logger,
  timeoutMs = READINESS_TIMEOUT_MS,
): Promise<ReadinessResponse> {
  const database = await check(ping, timeoutMs, logger);
  return {
    status: database === 'ok'
      ? 'ok'
      : 'unavailable',
    checks: { database },
  };
}
