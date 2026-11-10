import type { EmbeddingClient, VectorStore } from '@omni/rag-core';
import type { Env } from '../env';
import type { ObjectStore } from './object-store';
import { kbDocuments } from '@omni/db/schema';
import { INGESTION_PACKAGE_NAME } from '@omni/ingestion';
import {
  createOpenAiEmbeddingsFromApiKey,
  createSdkPineconeVectorStore,
  EMBEDDING_MODEL_ID,
} from '@omni/rag-core';
import { createObjectStore, createR2ObjectStoreClient } from './object-store';

export interface KbDeps {
  objectStore: ObjectStore;
  vectorStore: VectorStore;
  embeddings: EmbeddingClient;
  embeddingModelId: typeof EMBEDDING_MODEL_ID;
  ingestionPackageName: typeof INGESTION_PACKAGE_NAME;
  documentsTable: typeof kbDocuments;
  maxUploadBytes: number;
}

/** Shared KB runtime wiring used by documents and ingestion modules. */
export function createKbDeps(env: Env): KbDeps {
  return {
    objectStore: createObjectStore({
      bucket: env.R2_BUCKET,
      client: createR2ObjectStoreClient({
        accountId: env.R2_ACCOUNT_ID,
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        endpoint: env.R2_ENDPOINT,
      }),
    }),
    vectorStore: createSdkPineconeVectorStore({
      apiKey: env.PINECONE_API_KEY,
      indexName: env.PINECONE_INDEX,
    }),
    embeddings: createOpenAiEmbeddingsFromApiKey(env.OPENAI_API_KEY),
    embeddingModelId: EMBEDDING_MODEL_ID,
    ingestionPackageName: INGESTION_PACKAGE_NAME,
    documentsTable: kbDocuments,
    maxUploadBytes: env.KB_MAX_UPLOAD_BYTES,
  };
}
