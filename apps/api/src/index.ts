import process from 'node:process';
import { createClerkClient } from '@clerk/backend';
import { serve } from '@hono/node-server';
import { createDb, sql } from '@omni/db';
import { createApp } from './app';
import { env } from './env';
import { clerkVerifier } from './lib/auth';
import { createLogger } from './lib/logger';
import { clerkUserDirectory } from './modules/me/repo';
import { createMeService } from './modules/me/service';

const logger = createLogger({ level: env.LOG_LEVEL, pretty: env.NODE_ENV === 'development' });
const db = createDb(env.DATABASE_URL);
const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY, publishableKey: env.CLERK_PUBLISHABLE_KEY });

const app = createApp({
  logger,
  webOrigins: env.WEB_ORIGINS,
  verifier: clerkVerifier({
    secretKey: env.CLERK_SECRET_KEY,
    publishableKey: env.CLERK_PUBLISHABLE_KEY,
    authorizedParties: env.WEB_ORIGINS,
  }),
  meService: createMeService({
    directory: clerkUserDirectory(clerk),
  }),
  pingDatabase: async () => {
    await db.execute(sql`select 1`);
  },
});

const server = serve({ fetch: app.fetch, port: env.PORT }, ({ port }) => {
  logger.info({ port }, 'api listening');
});

function shutdown(signal: string): void {
  logger.info({ signal }, 'shutting down');
  server.close(() => {
    db.$client.end().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
