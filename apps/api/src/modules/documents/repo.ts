import type { Database } from '@omni/db';
import type { DocumentStatus } from '@omni/types';
import { and, desc, eq, sql } from '@omni/db';
import { kbDocuments } from '@omni/db/schema';

export interface KbDocumentRow {
  id: string;
  filename: string;
  contentType: string;
  byteSize: number;
  storageKey: string;
  status: DocumentStatus;
  errorSummary: string | null;
  chunkCount: number | null;
  contentHash: string;
  ingestionGeneration: number;
  uploadedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface CreateDocumentRow {
  id: string;
  filename: string;
  contentType: string;
  byteSize: number;
  storageKey: string;
  contentHash: string;
  uploadedBy: string;
}

export interface DocumentsRepo {
  insert: (row: CreateDocumentRow) => Promise<KbDocumentRow>;
  findById: (id: string) => Promise<KbDocumentRow | null>;
  list: () => Promise<KbDocumentRow[]>;
  /** Increment generation; return updated row or null if missing. */
  bumpGeneration: (id: string) => Promise<KbDocumentRow | null>;
  /** Bump generation, reset to pending for re-ingest. */
  prepareReingest: (id: string) => Promise<KbDocumentRow | null>;
  delete: (id: string) => Promise<void>;
  /** Set processing when id + generation still match; otherwise null (noop). */
  markProcessing: (id: string, expectedGeneration: number) => Promise<KbDocumentRow | null>;
  markReady: (
    id: string,
    expectedGeneration: number,
    chunkCount: number,
  ) => Promise<KbDocumentRow | null>;
  markFailed: (
    id: string,
    expectedGeneration: number,
    errorSummary: string,
  ) => Promise<KbDocumentRow | null>;
}

function mapRow(row: typeof kbDocuments.$inferSelect): KbDocumentRow {
  return {
    id: row.id,
    filename: row.filename,
    contentType: row.contentType,
    byteSize: row.byteSize,
    storageKey: row.storageKey,
    status: row.status,
    errorSummary: row.errorSummary,
    chunkCount: row.chunkCount,
    contentHash: row.contentHash,
    ingestionGeneration: row.ingestionGeneration,
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function generationMatch(id: string, expectedGeneration: number) {
  return and(
    eq(kbDocuments.id, id),
    eq(kbDocuments.ingestionGeneration, expectedGeneration),
  );
}

export function drizzleDocumentsRepo(db: Database): DocumentsRepo {
  return {
    async insert(input) {
      const now = new Date();
      const [row] = await db.insert(kbDocuments).values({
        id: input.id,
        filename: input.filename,
        contentType: input.contentType,
        byteSize: input.byteSize,
        storageKey: input.storageKey,
        status: 'pending',
        errorSummary: null,
        chunkCount: null,
        contentHash: input.contentHash,
        ingestionGeneration: 1,
        uploadedBy: input.uploadedBy,
        createdAt: now,
        updatedAt: now,
      }).returning();
      if (!row)
        throw new Error('Insert into kb_documents returned no row');
      return mapRow(row);
    },

    async findById(id) {
      const [row] = await db.select().from(kbDocuments).where(eq(kbDocuments.id, id)).limit(1);
      return row
        ? mapRow(row)
        : null;
    },

    async list() {
      const rows = await db.select().from(kbDocuments).orderBy(desc(kbDocuments.createdAt));
      return rows.map(mapRow);
    },

    async bumpGeneration(id) {
      const [row] = await db.update(kbDocuments)
        .set({
          ingestionGeneration: sql`${kbDocuments.ingestionGeneration} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(kbDocuments.id, id))
        .returning();
      return row
        ? mapRow(row)
        : null;
    },

    async prepareReingest(id) {
      const [row] = await db.update(kbDocuments)
        .set({
          ingestionGeneration: sql`${kbDocuments.ingestionGeneration} + 1`,
          status: 'pending',
          errorSummary: null,
          chunkCount: null,
          updatedAt: new Date(),
        })
        .where(eq(kbDocuments.id, id))
        .returning();
      return row
        ? mapRow(row)
        : null;
    },

    async delete(id) {
      await db.delete(kbDocuments).where(eq(kbDocuments.id, id));
    },

    async markProcessing(id, expectedGeneration) {
      const [row] = await db.update(kbDocuments)
        .set({
          status: 'processing',
          errorSummary: null,
          updatedAt: new Date(),
        })
        .where(generationMatch(id, expectedGeneration))
        .returning();
      return row
        ? mapRow(row)
        : null;
    },

    async markReady(id, expectedGeneration, chunkCount) {
      const [row] = await db.update(kbDocuments)
        .set({
          status: 'ready',
          chunkCount,
          errorSummary: null,
          updatedAt: new Date(),
        })
        .where(generationMatch(id, expectedGeneration))
        .returning();
      return row
        ? mapRow(row)
        : null;
    },

    async markFailed(id, expectedGeneration, errorSummary) {
      const [row] = await db.update(kbDocuments)
        .set({
          status: 'failed',
          errorSummary,
          chunkCount: null,
          updatedAt: new Date(),
        })
        .where(generationMatch(id, expectedGeneration))
        .returning();
      return row
        ? mapRow(row)
        : null;
    },
  };
}
