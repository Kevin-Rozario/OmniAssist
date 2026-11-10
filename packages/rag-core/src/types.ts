export interface KbChunk {
  documentId: string;
  filename: string;
  chunkIndex: number;
  text: string;
}

export interface VectorStore {
  upsertChunks: (chunks: KbChunk[]) => Promise<void>;
  deleteByDocumentId: (documentId: string) => Promise<void>;
}

/** Document `_id` for one chunk. ASCII, and stable across re-ingest. */
export function chunkId(documentId: string, chunkIndex: number): string {
  return `${documentId}:${chunkIndex}`;
}
