import { z } from 'zod';

export const DocumentStatusSchema = z.enum([
  'pending',
  'processing',
  'ready',
  'failed',
]);
export type DocumentStatus = z.infer<typeof DocumentStatusSchema>;

/** Why an upload was rejected before storage (also appears in problem `detail` / validation errors). */
export const DocumentUploadRejectReasonSchema = z.enum([
  'unsupported_format',
  'oversized',
]);
export type DocumentUploadRejectReason = z.infer<typeof DocumentUploadRejectReasonSchema>;

export const DocumentSummarySchema = z.object({
  id: z.uuid(),
  filename: z.string().min(1),
  contentType: z.string().min(1),
  byteSize: z.int().nonnegative(),
  status: DocumentStatusSchema,
  createdAt: z.iso.datetime(),
  errorSummary: z.string().nullable(),
  chunkCount: z.int().nonnegative().nullable(),
});
export type DocumentSummary = z.infer<typeof DocumentSummarySchema>;

export const DocumentDetailSchema = DocumentSummarySchema.extend({
  updatedAt: z.iso.datetime(),
  uploadedBy: z.string().min(1),
  contentHash: z.string().min(1),
});
export type DocumentDetail = z.infer<typeof DocumentDetailSchema>;

export const DocumentListResponseSchema = z.object({
  documents: z.array(DocumentSummarySchema),
});
export type DocumentListResponse = z.infer<typeof DocumentListResponseSchema>;

export const DocumentUploadErrorSchema = z.object({
  reason: DocumentUploadRejectReasonSchema,
  message: z.string().min(1),
  maxBytes: z.int().positive().optional(),
  contentType: z.string().optional(),
});
export type DocumentUploadError = z.infer<typeof DocumentUploadErrorSchema>;
