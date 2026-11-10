import { describe, expect, it, vi } from 'vitest';
import { createPineconeVectorStore } from './pinecone';

describe('createPineconeVectorStore', () => {
  it('upserts documents with chunk_text and title and replaces prior chunks', async () => {
    const upsert = vi.fn(async () => {});
    const deleteMany = vi.fn(async () => {});
    const listPage = vi.fn(async () => ({
      documents: [
        { _id: 'doc-1:0' },
        { _id: 'doc-1:1' },
      ],
      pagination: {},
    }));

    const store = createPineconeVectorStore({
      index: { upsert, deleteMany, listPage },
    });

    await store.upsertChunks([
      {
        documentId: 'doc-1',
        filename: 'a.md',
        chunkIndex: 0,
        text: 'hello',
      },
      {
        documentId: 'doc-1',
        filename: 'a.md',
        chunkIndex: 1,
        text: 'world',
      },
    ]);

    expect(listPage).toHaveBeenCalledWith({
      prefix: 'doc-1:',
      limit: 100,
      paginationToken: undefined,
    });
    expect(deleteMany).toHaveBeenCalledWith(['doc-1:0', 'doc-1:1']);
    expect(upsert).toHaveBeenCalledWith([
      {
        _id: 'doc-1:0',
        chunk_text: 'hello',
        title: 'a.md',
        documentId: 'doc-1',
        filename: 'a.md',
        chunkIndex: 0,
      },
      {
        _id: 'doc-1:1',
        chunk_text: 'world',
        title: 'a.md',
        documentId: 'doc-1',
        filename: 'a.md',
        chunkIndex: 1,
      },
    ]);
  });

  it('deleteByDocumentId removes listed ids', async () => {
    const upsert = vi.fn(async () => {});
    const deleteMany = vi.fn(async () => {});
    const listPage = vi.fn(async () => ({
      documents: [
        { _id: 'doc-2:0' },
      ],
      pagination: {},
    }));

    const store = createPineconeVectorStore({
      index: { upsert, deleteMany, listPage },
    });

    await store.deleteByDocumentId('doc-2');
    expect(deleteMany).toHaveBeenCalledWith(['doc-2:0']);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('re-upsert does not keep duplicate ids for the same document', async () => {
    const seen = new Map<string, string>();
    const upsert = vi.fn(async (documents) => {
      for (const document of documents)
        seen.set(document._id, document.chunk_text);
    });
    const deleteMany = vi.fn(async (ids: string[]) => {
      for (const id of ids)
        seen.delete(id);
    });
    const listPage = vi.fn(async () => ({
      documents: [
        ...seen.keys(),
      ].map(_id => ({ _id })),
      pagination: {},
    }));

    const store = createPineconeVectorStore({
      index: { upsert, deleteMany, listPage },
    });

    await store.upsertChunks([
      {
        documentId: 'doc-3',
        filename: 'b.md',
        chunkIndex: 0,
        text: 'v1',
      },
    ]);
    await store.upsertChunks([
      {
        documentId: 'doc-3',
        filename: 'b.md',
        chunkIndex: 0,
        text: 'v2',
      },
    ]);

    expect([
      ...seen.keys(),
    ]).toEqual(['doc-3:0']);
    expect(seen.get('doc-3:0')).toBe('v2');
  });

  it('rejects an empty chunk before calling Pinecone', async () => {
    const upsert = vi.fn(async () => {});
    const store = createPineconeVectorStore({
      index: {
        upsert,
        deleteMany: vi.fn(async () => {}),
        listPage: vi.fn(async () => ({ documents: [], pagination: {} })),
      },
    });

    await expect(store.upsertChunks([
      {
        documentId: 'doc-4',
        filename: 'empty.md',
        chunkIndex: 0,
        text: '   ',
      },
    ])).rejects.toThrow(/no text/);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('splits integrated-embedding upserts into batches of 96', async () => {
    const upsert = vi.fn(async (_documents: unknown[]) => {});
    const store = createPineconeVectorStore({
      index: {
        upsert,
        deleteMany: vi.fn(async () => {}),
        listPage: vi.fn(async () => ({ documents: [], pagination: {} })),
      },
    });

    await store.upsertChunks(Array.from({ length: 97 }, (_, chunkIndex) => ({
      documentId: 'doc-5',
      filename: 'long.md',
      chunkIndex,
      text: `chunk ${chunkIndex}`,
    })));

    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[0]?.[0]).toHaveLength(96);
    expect(upsert.mock.calls[1]?.[0]).toHaveLength(1);
  });
});
