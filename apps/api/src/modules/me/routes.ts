import type { MeService } from './service';
import { createRoute } from '@hono/zod-openapi';
import { currentSession } from '../../lib/auth';
import { createRouter, problemResponses } from '../../lib/openapi';
import { MeSchema } from './schemas';

const getMeRoute = createRoute({
  method: 'get',
  path: '/me',
  tags: ['Users'],
  summary: 'Current user',
  description: 'Returns the signed-in caller\'s profile and role.',
  security: [
    { bearerAuth: [] },
  ],
  responses: {
    200: {
      description: 'The caller\'s profile.',
      content: {
        'application/json': { schema: MeSchema },
      },
    },
    ...problemResponses(401, 500, 502),
  },
});

export function meRoutes(service: MeService) {
  return createRouter().openapi(getMeRoute, async (c) => {
    const me = await service.getMe(currentSession(c));
    return c.json(me, 200);
  });
}
