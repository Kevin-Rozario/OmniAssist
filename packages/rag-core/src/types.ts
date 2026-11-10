export interface KbChunk {
  documentId: string;
  filename: string;
  chunkIndex: number;
  text: string;
}

/** A chunk returned by a similarity search, with the provider's relevance score. */
export interface KbSearchHit extends KbChunk {
  score: number;
}

export interface KbSearchParams {
  /** Natural-language query. Embedded by the index with the same model used at ingest. */
  query: string;
  /** Maximum number of chunks to return. A positive integer. */
  topK: number;
  /** Rejects the search with the abort reason when it fires. */
  signal?: AbortSignal;
}

export interface VectorStore {
  upsertChunks: (chunks: KbChunk[]) => Promise<void>;
  deleteByDocumentId: (documentId: string) => Promise<void>;
  /** Most relevant chunks first. Returns `[]` when nothing matches. */
  search: (params: KbSearchParams) => Promise<KbSearchHit[]>;
}

/** Document `_id` for one chunk. ASCII, and stable across re-ingest. */
export function chunkId(documentId: string, chunkIndex: number): string {
  return `${documentId}:${chunkIndex}`;
}
