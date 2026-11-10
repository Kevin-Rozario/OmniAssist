import type { Database } from '@omni/db';
import type { DocumentStatus } from '@omni/types';
import { kbDocuments } from '@omni/db/schema';
import { desc, eq, sql } from 'drizzle-orm';

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

export interface CreateDocumentRow {
  id: string;
  filename: string;
  contentType: string;
  byteSize: number;
  storageKey: string;
  contentHash: string;
  uploadedBy: string;
  createdAt?: Date;
  updatedAt?: Date;
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

export function drizzleDocumentsRepo(db: Database): DocumentsRepo {
  return {
    async insert(input) {
      const now = input.createdAt ?? new Date();
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
        updatedAt: input.updatedAt ?? now,
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
  };
}

/** In-memory repo for unit tests. */
export function memoryDocumentsRepo(seed: KbDocumentRow[] = []): DocumentsRepo {
  const rows = new Map<string, KbDocumentRow>(seed.map(row => [
    row.id,
    { ...row },
  ]));

  return {
    async insert(input) {
      const now = input.createdAt ?? new Date();
      const row: KbDocumentRow = {
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
        updatedAt: input.updatedAt ?? now,
      };
      rows.set(row.id, row);
      return { ...row };
    },

    async findById(id) {
      const row = rows.get(id);
      return row
        ? { ...row }
        : null;
    },

    async list() {
      return [
        ...rows.values(),
      ]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map(row => ({ ...row }));
    },

    async bumpGeneration(id) {
      const row = rows.get(id);
      if (!row)
        return null;
      const updated = {
        ...row,
        ingestionGeneration: row.ingestionGeneration + 1,
        updatedAt: new Date(),
      };
      rows.set(id, updated);
      return { ...updated };
    },

    async prepareReingest(id) {
      const row = rows.get(id);
      if (!row)
        return null;
      const updated: KbDocumentRow = {
        ...row,
        ingestionGeneration: row.ingestionGeneration + 1,
        status: 'pending',
        errorSummary: null,
        chunkCount: null,
        updatedAt: new Date(),
      };
      rows.set(id, updated);
      return { ...updated };
    },

    async delete(id) {
      rows.delete(id);
    },
  };
}
