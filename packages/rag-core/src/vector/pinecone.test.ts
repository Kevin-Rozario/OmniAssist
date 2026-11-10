import type { PineconeDocumentsClient, PineconeSearchMatch, PineconeSearchRequest } from './pinecone';
import { describe, expect, it, vi } from 'vitest';
import { createPineconeVectorStore } from './pinecone';

const emptySearch: PineconeDocumentsClient['search'] = async () => ({ matches: [] });

function searchStore(search: PineconeDocumentsClient['search']) {
  return createPineconeVectorStore({
    index: {
      upsert: vi.fn(async () => {}),
      deleteMany: vi.fn(async () => {}),
      listPage: vi.fn(async () => ({ documents: [], pagination: {} })),
      search,
    },
  });
}

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
      index: {
        upsert,
        deleteMany,
        listPage,
        search: emptySearch,
      },
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
      index: {
        upsert,
        deleteMany,
        listPage,
        search: emptySearch,
      },
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
      index: {
        upsert,
        deleteMany,
        listPage,
        search: emptySearch,
      },
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
        search: emptySearch,
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
        search: emptySearch,
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

describe('createPineconeVectorStore search', () => {
  const match = (overrides: Partial<PineconeSearchMatch> = {}): PineconeSearchMatch => ({
    _id: 'doc-1:2',
    _score: 0.83,
    chunk_text: 'Install the VPN client.',
    filename: 'vpn-guide.md',
    documentId: 'doc-1',
    chunkIndex: 2,
    ...overrides,
  });

  it('sends one embed clause over chunk_text with topK and includeFields', async () => {
    const search = vi.fn(async (_request: PineconeSearchRequest) => ({ matches: [] }));

    await searchStore(search).search({ query: 'how do I set up a VPN?', topK: 8 });

    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith({
      scoreBy: [
        { type: 'embed', field: 'chunk_text', query: 'how do I set up a VPN?' },
      ],
      topK: 8,
      includeFields: [
        'chunk_text',
        'filename',
        'documentId',
        'chunkIndex',
      ],
    });
  });

  it('trims the query before sending it', async () => {
    const search = vi.fn(async (_request: PineconeSearchRequest) => ({ matches: [] }));

    await searchStore(search).search({ query: '  reset password \n', topK: 3 });

    expect(search.mock.calls[0]?.[0].scoreBy[0]?.query).toBe('reset password');
  });

  it('maps matches back to chunks in the order returned', async () => {
    const store = searchStore(async () => ({
      matches: [
        match(),
        match({
          _id: 'doc-2:0',
          _score: 0.5,
          chunk_text: 'Reset via SSO.',
          filename: 'sso.md',
          documentId: 'doc-2',
          chunkIndex: 0,
        }),
      ],
    }));

    await expect(store.search({ query: 'q', topK: 2 })).resolves.toEqual([
      {
        documentId: 'doc-1',
        filename: 'vpn-guide.md',
        chunkIndex: 2,
        text: 'Install the VPN client.',
        score: 0.83,
      },
      {
        documentId: 'doc-2',
        filename: 'sso.md',
        chunkIndex: 0,
        text: 'Reset via SSO.',
        score: 0.5,
      },
    ]);
  });

  it('returns an empty array for an empty or missing result', async () => {
    await expect(searchStore(async () => ({ matches: [] })).search({ query: 'q', topK: 5 }))
      .resolves
      .toEqual([]);
    await expect(searchStore(async () => ({})).search({ query: 'q', topK: 5 }))
      .resolves
      .toEqual([]);
  });

  it('treats a null score as 0 and drops matches missing required fields', async () => {
    const store = searchStore(async () => ({
      matches: [
        match({ _score: null }),
        match({ chunk_text: undefined }),
        match({ chunk_text: '' }),
        match({ filename: undefined }),
        match({ documentId: undefined }),
        match({ chunkIndex: undefined }),
      ],
    }));

    await expect(store.search({ query: 'q', topK: 5 })).resolves.toEqual([
      {
        documentId: 'doc-1',
        filename: 'vpn-guide.md',
        chunkIndex: 2,
        text: 'Install the VPN client.',
        score: 0,
      },
    ]);
  });

  it('rejects an empty or whitespace-only query without calling Pinecone', async () => {
    const search = vi.fn(emptySearch);
    const store = searchStore(search);

    await expect(store.search({ query: '', topK: 5 })).rejects.toThrow(/empty/);
    await expect(store.search({ query: '  \n\t', topK: 5 })).rejects.toThrow(/empty/);
    expect(search).not.toHaveBeenCalled();
  });

  it('rejects a non-positive or fractional topK without calling Pinecone', async () => {
    const search = vi.fn(emptySearch);
    const store = searchStore(search);

    await expect(store.search({ query: 'q', topK: 0 })).rejects.toThrow(/topK/);
    await expect(store.search({ query: 'q', topK: 2.5 })).rejects.toThrow(/topK/);
    expect(search).not.toHaveBeenCalled();
  });

  it('propagates provider errors', async () => {
    const store = searchStore(async () => {
      throw new Error('index unavailable');
    });

    await expect(store.search({ query: 'q', topK: 5 })).rejects.toThrow('index unavailable');
  });

  it('does not call Pinecone when the signal is already aborted', async () => {
    const search = vi.fn(emptySearch);
    const controller = new AbortController();
    controller.abort(new Error('client left'));

    await expect(searchStore(search).search({ query: 'q', topK: 5, signal: controller.signal }))
      .rejects
      .toThrow('client left');
    expect(search).not.toHaveBeenCalled();
  });

  it('rejects with the abort reason when the signal fires mid-search', async () => {
    const controller = new AbortController();
    const store = searchStore(() => new Promise(() => {}));

    const pending = store.search({ query: 'q', topK: 5, signal: controller.signal });
    controller.abort(new Error('deadline'));

    await expect(pending).rejects.toThrow('deadline');
  });
});
