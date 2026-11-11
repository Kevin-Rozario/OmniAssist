import type { DatabasePing } from './service';
import { createRoute } from '@hono/zod-openapi';
import { createRouter } from '../../lib/openapi';
import { HealthResponseSchema, ReadinessResponseSchema } from './schemas';
import { checkReadiness } from './service';

const healthRoute = createRoute({
  method: 'get',
  path: '/api/health',
  tags: ['Operations'],
  summary: 'Liveness probe',
  responses: {
    200: {
      description: 'The process can serve HTTP.',
      content: {
        'application/json': { schema: HealthResponseSchema },
      },
    },
  },
});

const readyRoute = createRoute({
  method: 'get',
  path: '/api/ready',
  tags: ['Operations'],
  summary: 'Readiness probe',
  responses: {
    200: {
      description: 'All dependencies are available.',
      content: {
        'application/json': { schema: ReadinessResponseSchema },
      },
    },
    503: {
      description: 'A required dependency is unavailable.',
      content: {
        'application/json': { schema: ReadinessResponseSchema },
      },
    },
  },
});

export interface HealthModuleDeps {
  pingDatabase: DatabasePing;
  readinessTimeoutMs?: number;
}

export function healthRoutes({ pingDatabase, readinessTimeoutMs }: HealthModuleDeps) {
  return createRouter()
    .openapi(healthRoute, c => c.json({ status: 'ok' as const }, 200))
    .openapi(readyRoute, async (c) => {
      const result = await checkReadiness(pingDatabase, c.var.logger, readinessTimeoutMs);
      return result.status === 'ok'
        ? c.json(result, 200)
        : c.json(result, 503);
    });
}
