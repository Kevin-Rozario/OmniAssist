import type { VectorStore } from '../types';
import { Pinecone } from '@pinecone-database/pinecone';
import { createPineconeVectorStore } from './pinecone';

export interface SdkPineconeVectorStoreOptions {
  apiKey: string;
  indexName: string;
}

/** Production VectorStore backed by the Pinecone SDK. */
export function createSdkPineconeVectorStore(
  options: SdkPineconeVectorStoreOptions,
): VectorStore {
  const index = new Pinecone({ apiKey: options.apiKey }).index(options.indexName);
  return createPineconeVectorStore({
    index: {
      upsert: records => index.upsert(records),
      deleteMany: ids => index.deleteMany(ids),
      listPaginated: opts => index.listPaginated(opts),
    },
  });
}
