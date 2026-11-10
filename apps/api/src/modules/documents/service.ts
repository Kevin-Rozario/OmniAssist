import type { VectorStore } from '@omni/rag-core';
import type { DocumentDetail, DocumentListResponse, DocumentSummary } from '@omni/types';
import type { ObjectStore } from '../../lib/object-store';
import type { DocumentEvents } from './events';
import type { DocumentsRepo, KbDocumentRow } from './repo';
import { createHash } from 'node:crypto';
import { v7 as uuidv7 } from 'uuid';
import { NotFoundError, UpstreamError } from '../../lib/errors';
import { assertSupportedUpload, displayFilename, storageKeyFor } from './formats';

export interface DocumentsServiceOptions {
  repo: DocumentsRepo;
  objectStore: ObjectStore;
  vectorStore: VectorStore;
  events: DocumentEvents;
  maxUploadBytes: number;
  createId?: () => string;
}

export interface UploadDocumentInput {
  filename: string;
  bytes: Uint8Array;
  uploadedBy: string;
  declaredContentType?: string | null;
}

export interface DocumentsService {
  create: (input: UploadDocumentInput) => Promise<DocumentDetail>;
  list: () => Promise<DocumentListResponse>;
  get: (id: string) => Promise<DocumentDetail>;
  delete: (id: string) => Promise<void>;
  reingest: (id: string) => Promise<DocumentDetail>;
}

function toSummary(row: KbDocumentRow): DocumentSummary {
  return {
    id: row.id,
    filename: row.filename,
    contentType: row.contentType,
    byteSize: row.byteSize,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    errorSummary: row.errorSummary,
    chunkCount: row.chunkCount,
  };
}

function toDetail(row: KbDocumentRow): DocumentDetail {
  return {
    ...toSummary(row),
    updatedAt: row.updatedAt.toISOString(),
    uploadedBy: row.uploadedBy,
    contentHash: row.contentHash,
  };
}

function contentHashOf(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function createDocumentsService(options: DocumentsServiceOptions): DocumentsService {
  const {
    repo,
    objectStore,
    vectorStore,
    events,
    maxUploadBytes,
    createId = uuidv7,
  } = options;

  return {
    async create(input) {
      const { contentType, safeName } = assertSupportedUpload({
        filename: input.filename,
        byteSize: input.bytes.byteLength,
        maxBytes: maxUploadBytes,
        declaredContentType: input.declaredContentType,
      });

      const id = createId();
      const key = storageKeyFor(id, safeName);

      try {
        await objectStore.put(key, input.bytes, contentType);
      }
      catch (error) {
        throw new UpstreamError('Could not store the uploaded document.', { cause: error });
      }

      let row: KbDocumentRow;
      try {
        row = await repo.insert({
          id,
          filename: displayFilename(input.filename),
          contentType,
          byteSize: input.bytes.byteLength,
          storageKey: key,
          contentHash: contentHashOf(input.bytes),
          uploadedBy: input.uploadedBy,
        });
      }
      catch (error) {
        try {
          await objectStore.delete(key);
        }
        catch {
          // Best-effort cleanup after a failed insert.
        }
        throw new UpstreamError('Could not create the document record.', { cause: error });
      }

      try {
        await events.emitUploaded({
          documentId: row.id,
          generation: row.ingestionGeneration,
        });
      }
      catch (error) {
        await repo.markFailed(
          row.id,
          row.ingestionGeneration,
          'Could not enqueue ingestion',
        );
        throw new UpstreamError('Could not enqueue document ingestion.', { cause: error });
      }

      return toDetail(row);
    },

    async list() {
      const rows = await repo.list();
      return {
        documents: rows.map(toSummary),
      };
    },

    async get(id) {
      const row = await repo.findById(id);
      if (!row)
        throw new NotFoundError(`Document ${id} does not exist.`);
      return toDetail(row);
    },

    async delete(id) {
      const bumped = await repo.bumpGeneration(id);
      if (!bumped)
        throw new NotFoundError(`Document ${id} does not exist.`);

      try {
        await vectorStore.deleteByDocumentId(id);
      }
      catch (error) {
        throw new UpstreamError('Could not delete indexed document chunks.', { cause: error });
      }

      await repo.delete(id);

      try {
        await objectStore.delete(bumped.storageKey);
      }
      catch {
        // Best-effort object cleanup; the DB row and index chunks are already removed.
      }
    },

    async reingest(id) {
      const row = await repo.prepareReingest(id);
      if (!row)
        throw new NotFoundError(`Document ${id} does not exist.`);

      try {
        await events.emitUploaded({
          documentId: row.id,
          generation: row.ingestionGeneration,
        });
      }
      catch (error) {
        await repo.markFailed(
          row.id,
          row.ingestionGeneration,
          'Could not enqueue ingestion',
        );
        throw new UpstreamError('Could not enqueue document ingestion.', { cause: error });
      }

      return toDetail(row);
    },
  };
}
