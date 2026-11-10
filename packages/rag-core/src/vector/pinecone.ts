import type { KbChunk, KbSearchHit, KbSearchParams, VectorStore } from '../types';
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

/** The `documents.search` request this store sends: one `embed` clause over `chunk_text`. */
export interface PineconeSearchRequest {
  scoreBy: Array<{ type: 'embed'; field: 'chunk_text'; query: string }>;
  topK: number;
  includeFields: string[];
}

/** One match from `documents.search`. Fields are optional because the index returns what exists. */
export interface PineconeSearchMatch {
  _id: string;
  _score?: number | null;
  chunk_text?: string;
  filename?: string;
  documentId?: string;
  chunkIndex?: number;
}

export interface PineconeDocumentsClient {
  upsert: (documents: PineconeKbDocument[]) => Promise<void>;
  search: (request: PineconeSearchRequest) => Promise<{
    matches?: PineconeSearchMatch[];
  }>;
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
const SEARCH_FIELDS = [
  'chunk_text',
  'filename',
  'documentId',
  'chunkIndex',
] as const;

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

    async search(params: KbSearchParams): Promise<KbSearchHit[]> {
      const query = params.query.trim();
      if (query.length === 0)
        throw new Error('Search query is empty');
      if (!Number.isInteger(params.topK) || params.topK < 1)
        throw new Error('Search topK must be a positive integer');

      params.signal?.throwIfAborted();

      const response = await abortable(
        options.index.search({
          scoreBy: [
            { type: 'embed', field: 'chunk_text', query },
          ],
          topK: params.topK,
          includeFields: [...SEARCH_FIELDS],
        }),
        params.signal,
      );

      return (response.matches ?? []).flatMap((match) => {
        const hit = toSearchHit(match);
        return hit
          ? [hit]
          : [];
      });
    },
  };
}

/** Drops a match missing a field the answer flow needs rather than inventing values. */
function toSearchHit(match: PineconeSearchMatch): KbSearchHit | undefined {
  const { chunk_text: text, filename, documentId, chunkIndex } = match;
  if (
    typeof text !== 'string'
    || text.length === 0
    || typeof filename !== 'string'
    || typeof documentId !== 'string'
    || typeof chunkIndex !== 'number'
  ) {
    return undefined;
  }
  return {
    documentId,
    filename,
    chunkIndex,
    text,
    score: match._score ?? 0,
  };
}

/** The SDK search call takes no signal, so cancellation is enforced here. */
function abortable<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal)
    return promise;

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', onAbort);
    });
  });
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
