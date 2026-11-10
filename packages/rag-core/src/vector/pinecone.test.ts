import { describe, expect, it, vi } from 'vitest';
import { createPineconeVectorStore } from './pinecone';

describe('createPineconeVectorStore', () => {
  it('upserts with documentId:chunkIndex ids and replaces prior vectors', async () => {
    const upsert = vi.fn(async () => {});
    const deleteMany = vi.fn(async () => {});
    const listPaginated = vi.fn(async () => ({
      vectors: [
        { id: 'doc-1:0' },
        { id: 'doc-1:1' },
      ],
      pagination: {},
    }));

    const store = createPineconeVectorStore({
      index: { upsert, deleteMany, listPaginated },
    });

    await store.upsertChunks([
      {
        documentId: 'doc-1',
        filename: 'a.md',
        chunkIndex: 0,
        text: 'hello',
        values: [0.1, 0.2],
      },
      {
        documentId: 'doc-1',
        filename: 'a.md',
        chunkIndex: 1,
        text: 'world',
        values: [0.3, 0.4],
      },
    ]);

    expect(listPaginated).toHaveBeenCalledWith({
      prefix: 'doc-1:',
      limit: 100,
      paginationToken: undefined,
    });
    expect(deleteMany).toHaveBeenCalledWith(['doc-1:0', 'doc-1:1']);
    expect(upsert).toHaveBeenCalledWith([
      {
        id: 'doc-1:0',
        values: [0.1, 0.2],
        metadata: {
          documentId: 'doc-1',
          filename: 'a.md',
          chunkIndex: 0,
          text: 'hello',
        },
      },
      {
        id: 'doc-1:1',
        values: [0.3, 0.4],
        metadata: {
          documentId: 'doc-1',
          filename: 'a.md',
          chunkIndex: 1,
          text: 'world',
        },
      },
    ]);
  });

  it('deleteByDocumentId removes listed ids', async () => {
    const upsert = vi.fn(async () => {});
    const deleteMany = vi.fn(async () => {});
    const listPaginated = vi.fn(async () => ({
      vectors: [
        { id: 'doc-2:0' },
      ],
      pagination: {},
    }));

    const store = createPineconeVectorStore({
      index: { upsert, deleteMany, listPaginated },
    });

    await store.deleteByDocumentId('doc-2');
    expect(deleteMany).toHaveBeenCalledWith(['doc-2:0']);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('re-upsert does not keep duplicate ids for the same document', async () => {
    const seen = new Map<string, number[]>();
    const upsert = vi.fn(async (records) => {
      for (const record of records)
        seen.set(record.id, record.values);
    });
    const deleteMany = vi.fn(async (ids: string[]) => {
      for (const id of ids)
        seen.delete(id);
    });
    const listPaginated = vi.fn(async () => ({
      vectors: [
        ...seen.keys(),
      ].map(id => ({ id })),
      pagination: {},
    }));

    const store = createPineconeVectorStore({
      index: { upsert, deleteMany, listPaginated },
    });

    await store.upsertChunks([
      {
        documentId: 'doc-3',
        filename: 'b.md',
        chunkIndex: 0,
        text: 'v1',
        values: [1],
      },
    ]);
    await store.upsertChunks([
      {
        documentId: 'doc-3',
        filename: 'b.md',
        chunkIndex: 0,
        text: 'v2',
        values: [2],
      },
    ]);

    expect([
      ...seen.keys(),
    ]).toEqual(['doc-3:0']);
    expect(seen.get('doc-3:0')).toEqual([2]);
  });
});
