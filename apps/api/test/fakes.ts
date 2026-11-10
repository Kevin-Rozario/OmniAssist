import type { VectorStore } from '@omni/rag-core';
import type { ObjectStore } from '../src/lib/object-store';

export function fakeObjectStore(
  initial: Record<string, Uint8Array> = {},
): ObjectStore & { objects: Map<string, Uint8Array> } {
  const objects = new Map(Object.entries(initial));
  return {
    objects,
    async put(key, body) {
      objects.set(key, body);
    },
    async get(key) {
      const body = objects.get(key);
      if (!body)
        throw new Error(`missing object ${key}`);
      return body;
    },
    async delete(key) {
      objects.delete(key);
    },
  };
}

export function fakeVectorStore(): VectorStore & { upserts: unknown[]; deleted: string[] } {
  const upserts: unknown[] = [];
  const deleted: string[] = [];
  return {
    upserts,
    deleted,
    async search() {
      return [];
    },
    async upsertChunks(chunks) {
      upserts.push(chunks);
    },
    async deleteByDocumentId(documentId) {
      deleted.push(documentId);
    },
  };
}
