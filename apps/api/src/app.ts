import type { AuthVerifier } from './lib/auth';
import type { Logger } from './lib/logger';
import type { DocumentsService } from './modules/documents/service';
import type { DatabasePing } from './modules/health/service';
import type { InngestHttpHandler } from './modules/inngest/routes';
import type { MeService } from './modules/me/service';
import { Scalar } from '@scalar/hono-api-reference';
import { cors } from 'hono/cors';
import { requireAuth } from './lib/auth';
import { notFound, onError } from './lib/errors';
import { createRouter } from './lib/openapi';
import { accessLog, REQUEST_ID_HEADER, requestContext } from './lib/request-context';
import { documentsRoutes } from './modules/documents/routes';
import { healthRoutes } from './modules/health/routes';
import { meRoutes } from './modules/me/routes';

export interface AppDeps {
  logger: Logger;
  webOrigins: string[];
  verifier: AuthVerifier;
  meService: MeService;
  documentsService: DocumentsService;
  /** Enforced on POST /v1/documents before the body is fully buffered. */
  maxUploadBytes: number;
  pingDatabase: DatabasePing;
  readinessTimeoutMs?: number;
  /** Background-jobs serve path; outside `/v1`, no Clerk session required. */
  inngestHandler?: InngestHttpHandler;
}

export function createApp(deps: AppDeps) {
  const app = createRouter();

  app.use('*', requestContext(deps.logger), accessLog());
  app.use('*', cors({
    origin: origin => (deps.webOrigins.includes(origin)
      ? origin
      : null),
    allowHeaders: ['Authorization', 'Content-Type', REQUEST_ID_HEADER],
    exposeHeaders: [REQUEST_ID_HEADER],
    maxAge: 600,
  }));
  // Everything under /v1 is protected; public endpoints live outside the version prefix.
  app.use('/v1/*', deps.verifier, requireAuth);

  app.onError(onError);
  app.notFound(notFound);

  app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'A Clerk session token.',
  });
  app.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'OmniAssist AI API',
      version: '1.0.0',
      description: 'Errors use RFC 9457 problem details (`application/problem+json`).',
    },
  });
  app.get('/docs', Scalar({ url: '/openapi.json', pageTitle: 'OmniAssist AI API' }));

  if (deps.inngestHandler) {
    app.on(
      [
        'GET',
        'PUT',
        'POST',
      ],
      '/api/inngest',
      c => deps.inngestHandler!(c),
    );
  }

  return app
    .route('/', healthRoutes(deps))
    .route('/v1', meRoutes(deps.meService))
    .route('/v1', documentsRoutes(deps.documentsService, {
      maxUploadBytes: deps.maxUploadBytes,
    }));
}

export type AppType = ReturnType<typeof createApp>;
