import type { ChunkVector, VectorStore } from '../types';
import { vectorId } from '../types';

export interface PineconeRecord {
  id: string;
  values: number[];
  metadata?: Record<string, string | number | boolean>;
}

export interface PineconeIndexClient {
  upsert: (records: PineconeRecord[]) => Promise<void>;
  deleteMany: (ids: string[]) => Promise<void>;
  listPaginated: (options: {
    prefix: string;
    limit?: number;
    paginationToken?: string;
  }) => Promise<{
    vectors?: Array<{ id?: string }>;
    pagination?: { next?: string };
  }>;
}

export interface PineconeVectorStoreOptions {
  index: PineconeIndexClient;
  /** Max vectors per upsert call. */
  upsertBatchSize?: number;
}

const DEFAULT_UPSERT_BATCH = 100;
/** Pinecone metadata string fields should stay well under the platform limit. */
const MAX_TEXT_METADATA_CHARS = 32_000;

export function createPineconeVectorStore(
  options: PineconeVectorStoreOptions,
): VectorStore {
  const upsertBatchSize = options.upsertBatchSize ?? DEFAULT_UPSERT_BATCH;

  return {
    async upsertChunks(chunks: ChunkVector[]): Promise<void> {
      if (chunks.length === 0)
        return;

      const documentIds = new Set(chunks.map(chunk => chunk.documentId));
      for (const documentId of documentIds)
        await deleteByDocumentId(options.index, documentId);

      const records: PineconeRecord[] = chunks.map(chunk => ({
        id: vectorId(chunk.documentId, chunk.chunkIndex),
        values: chunk.values,
        metadata: {
          documentId: chunk.documentId,
          filename: chunk.filename,
          chunkIndex: chunk.chunkIndex,
          text: chunk.text.slice(0, MAX_TEXT_METADATA_CHARS),
        },
      }));

      for (let offset = 0; offset < records.length; offset += upsertBatchSize) {
        const batch = records.slice(offset, offset + upsertBatchSize);
        await options.index.upsert(batch);
      }
    },

    async deleteByDocumentId(documentId: string): Promise<void> {
      await deleteByDocumentId(options.index, documentId);
    },
  };
}

async function deleteByDocumentId(
  index: PineconeIndexClient,
  documentId: string,
): Promise<void> {
  const prefix = `${documentId}:`;
  let paginationToken: string | undefined;
  const ids: string[] = [];

  do {
    const page = await index.listPaginated({
      prefix,
      limit: 100,
      paginationToken,
    });
    for (const vector of page.vectors ?? []) {
      if (vector.id)
        ids.push(vector.id);
    }
    paginationToken = page.pagination?.next;
  } while (paginationToken);

  if (ids.length > 0)
    await index.deleteMany(ids);
}
