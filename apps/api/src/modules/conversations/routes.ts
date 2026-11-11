import type { ConversationsService } from './service';
import { createRoute } from '@hono/zod-openapi';
import { currentSession } from '../../lib/auth';
import { createRouter, problemResponses } from '../../lib/openapi';
import {
  ConversationDetailOpenApiSchema,
  ConversationIdParamSchema,
  ConversationListOpenApiSchema,
  ConversationSummaryOpenApiSchema,
  RenameConversationOpenApiSchema,
} from './schemas';

const security = [
  { bearerAuth: [] },
];

const listConversationsRoute = createRoute({
  method: 'get',
  path: '/conversations',
  tags: ['Conversations'],
  summary: 'List your conversations',
  description: 'Your most recently active conversations first, at most 100.',
  security,
  responses: {
    200: {
      description: 'Conversation summaries.',
      content: {
        'application/json': { schema: ConversationListOpenApiSchema },
      },
    },
    ...problemResponses(401, 500),
  },
});

const getConversationRoute = createRoute({
  method: 'get',
  path: '/conversations/{id}',
  tags: ['Conversations'],
  summary: 'Get one of your conversations',
  description: 'Returns the title and every saved exchange in order. Another user\'s id responds 404.',
  security,
  request: { params: ConversationIdParamSchema },
  responses: {
    200: {
      description: 'Conversation with its exchanges.',
      content: {
        'application/json': { schema: ConversationDetailOpenApiSchema },
      },
    },
    ...problemResponses(401, 404, 500),
  },
});

const renameConversationRoute = createRoute({
  method: 'patch',
  path: '/conversations/{id}',
  tags: ['Conversations'],
  summary: 'Rename one of your conversations',
  security,
  request: {
    params: ConversationIdParamSchema,
    body: {
      content: {
        'application/json': { schema: RenameConversationOpenApiSchema },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'The renamed conversation.',
      content: {
        'application/json': { schema: ConversationSummaryOpenApiSchema },
      },
    },
    ...problemResponses(400, 401, 404, 500),
  },
});

const deleteConversationRoute = createRoute({
  method: 'delete',
  path: '/conversations/{id}',
  tags: ['Conversations'],
  summary: 'Delete one of your conversations',
  description: 'Permanently removes the conversation and all its exchanges.',
  security,
  request: { params: ConversationIdParamSchema },
  responses: {
    204: { description: 'Conversation removed.' },
    ...problemResponses(401, 404, 500),
  },
});

export function conversationsRoutes(service: ConversationsService) {
  return createRouter()
    .openapi(listConversationsRoute, async (c) => {
      return c.json(await service.list(currentSession(c).userId), 200);
    })
    .openapi(getConversationRoute, async (c) => {
      const { id } = c.req.valid('param');
      return c.json(await service.get(currentSession(c).userId, id), 200);
    })
    .openapi(renameConversationRoute, async (c) => {
      const { id } = c.req.valid('param');
      const { title } = c.req.valid('json');
      return c.json(await service.rename(currentSession(c).userId, id, title), 200);
    })
    .openapi(deleteConversationRoute, async (c) => {
      const { id } = c.req.valid('param');
      await service.delete(currentSession(c).userId, id);
      return c.body(null, 204);
    });
}
