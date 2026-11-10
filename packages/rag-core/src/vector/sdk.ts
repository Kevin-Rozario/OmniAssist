import type { VectorStore } from '../types';
import { Pinecone } from '@pinecone-database/pinecone';
import { createPineconeVectorStore } from './pinecone';

export interface SdkPineconeVectorStoreOptions {
  apiKey: string;
  indexName: string;
}

/**
 * Production VectorStore for the document index.
 * Pinecone embeds `chunk_text`; this client sends plain text.
 * Writes go to the default namespace.
 */
export function createSdkPineconeVectorStore(
  options: SdkPineconeVectorStoreOptions,
): VectorStore {
  const index = new Pinecone({ apiKey: options.apiKey }).index({
    name: options.indexName,
  });

  return createPineconeVectorStore({
    index: {
      upsert: async (documents) => {
        await index.documents.upsert({ documents });
      },
      deleteMany: async (ids) => {
        await index.documents.delete({ ids });
      },
      search: request => index.documents.search(request),
      listPage: opts => index.documents.list(opts),
    },
  });
}
