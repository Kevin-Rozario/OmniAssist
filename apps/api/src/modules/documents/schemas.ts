import { z } from '@hono/zod-openapi';
import {
  DocumentDetailSchema,
  DocumentListResponseSchema,
} from '@omni/types';

export const DocumentDetailOpenApiSchema = DocumentDetailSchema.meta({ id: 'DocumentDetail' });
export const DocumentListResponseOpenApiSchema = DocumentListResponseSchema.meta({
  id: 'DocumentListResponse',
});

export const DocumentIdParamSchema = z.object({
  id: z.uuid().openapi({
    param: { name: 'id', in: 'path' },
    example: '019a1b2c-3d4e-7f80-9abc-def012345678',
  }),
});

/** Multipart body: single `file` field (binary in OpenAPI). */
export const DocumentUploadBodySchema = z.object({
  file: z
    .custom<File>(value => typeof File !== 'undefined' && value instanceof File, {
      message: 'Expected a file upload in the "file" field.',
    })
    .openapi({
      type: 'string',
      format: 'binary',
      description: 'Knowledge-base source file (.md, .pdf, .txt, or .docx).',
    }),
});
