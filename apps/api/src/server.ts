import type { Env } from './env';
import process from 'node:process';
import { createClerkClient } from '@clerk/backend';
import { serve } from '@hono/node-server';
import { createDb, sql } from '@omni/db';
import { createApp } from './app';
import { clerkVerifier } from './lib/auth';
import { createKbDeps } from './lib/kb-deps';
import { createLogger } from './lib/logger';
import { drizzleDocumentsRepo } from './modules/documents/repo';
import { createDocumentsService } from './modules/documents/service';
import { createInngestClient } from './modules/inngest/client';
import { inngestDocumentEvents } from './modules/inngest/events';
import { createInngestHandler } from './modules/inngest/routes';
import { clerkUserDirectory } from './modules/me/repo';
import { createMeService } from './modules/me/service';

export function startServer(env: Env): void {
  const logger = createLogger({ level: env.LOG_LEVEL, pretty: env.NODE_ENV === 'development' });
  const db = createDb(env.DATABASE_URL);
  const kbDeps = createKbDeps(env);
  const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY, publishableKey: env.CLERK_PUBLISHABLE_KEY });
  const documentsRepo = drizzleDocumentsRepo(db);
  const inngest = createInngestClient({
    eventKey: env.INNGEST_EVENT_KEY,
    signingKey: env.INNGEST_SIGNING_KEY,
  });
  const ingestDeps = {
    repo: documentsRepo,
    objectStore: kbDeps.objectStore,
    embeddings: kbDeps.embeddings,
    vectorStore: kbDeps.vectorStore,
  };

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
    documentsService: createDocumentsService({
      repo: documentsRepo,
      objectStore: kbDeps.objectStore,
      vectorStore: kbDeps.vectorStore,
      events: inngestDocumentEvents(inngest),
      maxUploadBytes: kbDeps.maxUploadBytes,
    }),
    maxUploadBytes: kbDeps.maxUploadBytes,
    inngestHandler: createInngestHandler(inngest, ingestDeps),
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
}
