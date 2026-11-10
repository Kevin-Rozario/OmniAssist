import { integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const kbDocumentStatusEnum = pgEnum('kb_document_status', [
  'pending',
  'processing',
  'ready',
  'failed',
]);

export const kbDocuments = pgTable('kb_documents', {
  id: uuid('id').primaryKey(),
  filename: text('filename').notNull(),
  contentType: text('content_type').notNull(),
  byteSize: integer('byte_size').notNull(),
  storageKey: text('storage_key').notNull(),
  status: kbDocumentStatusEnum('status').notNull().default('pending'),
  errorSummary: text('error_summary'),
  chunkCount: integer('chunk_count'),
  contentHash: text('content_hash').notNull(),
  ingestionGeneration: integer('ingestion_generation').notNull().default(1),
  uploadedBy: text('uploaded_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
