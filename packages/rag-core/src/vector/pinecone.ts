import type { KbChunk, VectorStore } from '../types';
import { chunkId } from '../types';

/** One document written to the `omniassist-kb` schema. */
export interface PineconeKbDocument {
  _id: string;
  /** Embedded by Pinecone (`text-embedding-3-small`, 1536, cosine) and full-text indexed. */
  chunk_text: string;
  /** English full-text field. The source filename. */
  title: string;
  documentId: string;
  filename: string;
  chunkIndex: number;
}

export interface PineconeDocumentsClient {
  upsert: (documents: PineconeKbDocument[]) => Promise<void>;
  deleteMany: (ids: string[]) => Promise<void>;
  listPage: (options: {
    prefix: string;
    limit?: number;
    paginationToken?: string;
  }) => Promise<{
    documents?: Array<{ _id?: string }>;
    pagination?: { next?: string };
  }>;
}

export interface PineconeVectorStoreOptions {
  index: PineconeDocumentsClient;
  /**
   * Documents per upsert request. The SDK allows 1000; embedding writes stay
   * in smaller batches so a request with `chunk_text` stays within provider limits.
   */
  upsertBatchSize?: number;
  /** Delete-by-id accepts at most 1000 ids. */
  deleteBatchSize?: number;
}

const DEFAULT_UPSERT_BATCH = 96;
const DEFAULT_DELETE_BATCH = 1000;
const LIST_PAGE_SIZE = 100;

export function createPineconeVectorStore(
  options: PineconeVectorStoreOptions,
): VectorStore {
  const upsertBatchSize = options.upsertBatchSize ?? DEFAULT_UPSERT_BATCH;
  const deleteBatchSize = options.deleteBatchSize ?? DEFAULT_DELETE_BATCH;

  return {
    async upsertChunks(chunks: KbChunk[]): Promise<void> {
      if (chunks.length === 0)
        return;

      const documentIds = new Set(chunks.map(chunk => chunk.documentId));
      for (const documentId of documentIds)
        await deleteByDocumentId(options.index, documentId, deleteBatchSize);

      const documents = chunks.map(toDocument);

      for (let offset = 0; offset < documents.length; offset += upsertBatchSize) {
        const batch = documents.slice(offset, offset + upsertBatchSize);
        await options.index.upsert(batch);
      }
    },

    async deleteByDocumentId(documentId: string): Promise<void> {
      await deleteByDocumentId(options.index, documentId, deleteBatchSize);
    },
  };
}

function toDocument(chunk: KbChunk): PineconeKbDocument {
  if (chunk.text.trim().length === 0) {
    throw new Error(
      `Chunk ${chunk.chunkIndex} of document ${chunk.documentId} has no text`,
    );
  }

  return {
    _id: chunkId(chunk.documentId, chunk.chunkIndex),
    chunk_text: chunk.text,
    title: chunk.filename,
    documentId: chunk.documentId,
    filename: chunk.filename,
    chunkIndex: chunk.chunkIndex,
  };
}

async function deleteByDocumentId(
  index: PineconeDocumentsClient,
  documentId: string,
  deleteBatchSize: number,
): Promise<void> {
  const prefix = `${documentId}:`;
  let paginationToken: string | undefined;
  const ids: string[] = [];

  do {
    const page = await index.listPage({
      prefix,
      limit: LIST_PAGE_SIZE,
      paginationToken,
    });
    for (const document of page.documents ?? []) {
      if (document._id)
        ids.push(document._id);
    }
    paginationToken = page.pagination?.next;
  } while (paginationToken);

  for (let offset = 0; offset < ids.length; offset += deleteBatchSize) {
    const batch = ids.slice(offset, offset + deleteBatchSize);
    await index.deleteMany(batch);
  }
}
