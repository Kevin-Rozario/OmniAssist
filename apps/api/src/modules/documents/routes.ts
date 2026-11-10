import type { DocumentsService } from './service';
import { createRoute } from '@hono/zod-openapi';
import { currentSession, requireRole } from '../../lib/auth';
import { createRouter, problemResponses } from '../../lib/openapi';
import {
  DocumentDetailOpenApiSchema,
  DocumentIdParamSchema,
  DocumentListResponseOpenApiSchema,
  DocumentUploadBodySchema,
} from './schemas';

const listDocumentsRoute = createRoute({
  method: 'get',
  path: '/documents',
  tags: ['Documents'],
  summary: 'List knowledge-base documents',
  security: [
    { bearerAuth: [] },
  ],
  responses: {
    200: {
      description: 'Document summaries.',
      content: {
        'application/json': { schema: DocumentListResponseOpenApiSchema },
      },
    },
    ...problemResponses(401, 403, 500, 502),
  },
});

const getDocumentRoute = createRoute({
  method: 'get',
  path: '/documents/{id}',
  tags: ['Documents'],
  summary: 'Get a knowledge-base document',
  security: [
    { bearerAuth: [] },
  ],
  request: {
    params: DocumentIdParamSchema,
  },
  responses: {
    200: {
      description: 'Document detail.',
      content: {
        'application/json': { schema: DocumentDetailOpenApiSchema },
      },
    },
    ...problemResponses(401, 403, 404, 500, 502),
  },
});

const uploadDocumentRoute = createRoute({
  method: 'post',
  path: '/documents',
  tags: ['Documents'],
  summary: 'Upload a knowledge-base document',
  security: [
    { bearerAuth: [] },
  ],
  request: {
    body: {
      content: {
        'multipart/form-data': {
          schema: DocumentUploadBodySchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: {
      description: 'Document created as pending.',
      content: {
        'application/json': { schema: DocumentDetailOpenApiSchema },
      },
    },
    ...problemResponses(400, 401, 403, 500, 502),
  },
});

const deleteDocumentRoute = createRoute({
  method: 'delete',
  path: '/documents/{id}',
  tags: ['Documents'],
  summary: 'Delete a knowledge-base document',
  security: [
    { bearerAuth: [] },
  ],
  request: {
    params: DocumentIdParamSchema,
  },
  responses: {
    204: {
      description: 'Document and artifacts removed.',
    },
    ...problemResponses(401, 403, 404, 500, 502),
  },
});

const reingestDocumentRoute = createRoute({
  method: 'post',
  path: '/documents/{id}/reingest',
  tags: ['Documents'],
  summary: 'Re-ingest a knowledge-base document',
  security: [
    { bearerAuth: [] },
  ],
  request: {
    params: DocumentIdParamSchema,
  },
  responses: {
    200: {
      description: 'Document queued for re-ingestion.',
      content: {
        'application/json': { schema: DocumentDetailOpenApiSchema },
      },
    },
    ...problemResponses(401, 403, 404, 500, 502),
  },
});

export function documentsRoutes(service: DocumentsService) {
  const router = createRouter();
  // Apply before openapi handlers; do not chain `.use()` into the return type
  // or OpenAPIHono drops route types needed by the Hono RPC client.
  router.use('*', requireRole('admin'));

  return router
    .openapi(listDocumentsRoute, async (c) => {
      currentSession(c);
      return c.json(await service.list(), 200);
    })
    .openapi(getDocumentRoute, async (c) => {
      currentSession(c);
      const { id } = c.req.valid('param');
      return c.json(await service.get(id), 200);
    })
    .openapi(uploadDocumentRoute, async (c) => {
      const session = currentSession(c);
      const { file } = c.req.valid('form');
      const bytes = new Uint8Array(await file.arrayBuffer());
      const document = await service.create({
        filename: file.name || 'upload.bin',
        bytes,
        uploadedBy: session.userId,
        declaredContentType: file.type || null,
      });
      return c.json(document, 201);
    })
    .openapi(deleteDocumentRoute, async (c) => {
      currentSession(c);
      const { id } = c.req.valid('param');
      await service.delete(id);
      return c.body(null, 204);
    })
    .openapi(reingestDocumentRoute, async (c) => {
      currentSession(c);
      const { id } = c.req.valid('param');
      return c.json(await service.reingest(id), 200);
    });
}
