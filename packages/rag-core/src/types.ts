export interface EmbeddingClient {
  embed: (texts: string[]) => Promise<number[][]>;
}

export interface ChunkVector {
  documentId: string;
  filename: string;
  chunkIndex: number;
  text: string;
  values: number[];
}

export interface VectorStore {
  upsertChunks: (chunks: ChunkVector[]) => Promise<void>;
  deleteByDocumentId: (documentId: string) => Promise<void>;
}

export function vectorId(documentId: string, chunkIndex: number): string {
  return `${documentId}:${chunkIndex}`;
}
