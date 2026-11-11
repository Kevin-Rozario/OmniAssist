import { expect, it, vi } from 'vitest';
import {
  ApiError,
  createApiClient,
  deleteConversation,
  deleteDocument,
  getConversation,
  listConversations,
  listDocuments,
  reingestDocument,
  renameConversation,
  uploadDocument,
} from './api-client';

const problem = {
  type: 'https://omni-it-copilot.dev/problems/unauthenticated',
  title: 'Authentication required',
  status: 401,
  requestId: 'req-test',
};

const documentId = '550e8400-e29b-41d4-a716-446655440000';

const documentDetail = {
  id: documentId,
  filename: 'policy.md',
  contentType: 'text/markdown',
  byteSize: 128,
  status: 'pending' as const,
  createdAt: '2026-01-15T12:00:00.000Z',
  updatedAt: '2026-01-15T12:00:00.000Z',
  errorSummary: null,
  chunkCount: null,
  uploadedBy: 'user_admin',
  contentHash: 'a'.repeat(64),
};

it('sends the bearer token and turns a 401 problem into ApiError', async () => {
  const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(problem), {
    status: 401,
    headers: { 'content-type': 'application/problem+json' },
  }));
  vi.stubGlobal('fetch', fetchMock);

  const client = createApiClient(async () => 'session-token');
  const error = await client.api.v1.me.$get().then(() => {
    throw new Error('expected the 401 response to throw');
  }, (caught: unknown) => caught);

  expect(error).toBeInstanceOf(ApiError);
  if (!(error instanceof ApiError))
    return;
  expect(error.problem.type).toBe(problem.type);

  const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
  expect(headers.get('Authorization')).toBe('Bearer session-token');
  expect(headers.get('X-Request-Id')).toMatch(/^[\w-]{1,64}$/);
});

it('exposes typed document routes that match AppType paths', async () => {
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();

    if (method === 'GET' && url.endsWith('/api/v1/documents')) {
      return new Response(JSON.stringify({
        documents: [documentDetail],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (method === 'POST' && url.endsWith('/api/v1/documents')) {
      return new Response(JSON.stringify(documentDetail), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (method === 'DELETE' && url.endsWith(`/api/v1/documents/${documentId}`)) {
      return new Response(null, { status: 204 });
    }

    if (method === 'POST' && url.endsWith(`/api/v1/documents/${documentId}/reingest`)) {
      return new Response(JSON.stringify({ ...documentDetail, status: 'pending' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(problem), {
      status: 404,
      headers: { 'content-type': 'application/problem+json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);

  const getToken = async () => 'session-token';
  const client = createApiClient(getToken);

  // Compile-time + runtime proof that AppType exposes the documents RPC surface.
  expect(typeof client.api.v1.documents.$get).toBe('function');
  expect(typeof client.api.v1.documents.$post).toBe('function');
  expect(typeof client.api.v1.documents[':id'].$delete).toBe('function');
  expect(typeof client.api.v1.documents[':id'].reingest.$post).toBe('function');

  const listed = await listDocuments(getToken);
  expect(listed.documents).toHaveLength(1);
  expect(listed.documents[0]?.id).toBe(documentId);

  const uploaded = await uploadDocument(getToken, new File(['hello'], 'policy.md', {
    type: 'text/markdown',
  }));
  expect(uploaded.status).toBe('pending');

  await deleteDocument(getToken, documentId);

  const reingested = await reingestDocument(getToken, documentId);
  expect(reingested.id).toBe(documentId);

  const urls = fetchMock.mock.calls.map(([input]) => String(input));
  expect(urls.some(url => url.endsWith('/api/v1/documents'))).toBe(true);
  expect(urls.some(url => url.endsWith(`/api/v1/documents/${documentId}`))).toBe(true);
  expect(urls.some(url => url.endsWith(`/api/v1/documents/${documentId}/reingest`))).toBe(true);
});

const conversationId = '650e8400-e29b-41d4-a716-446655440000';
const conversationSummary = {
  id: conversationId,
  title: 'VPN setup',
  updatedAt: '2026-01-15T12:00:00.000Z',
};

it('lists, reads, renames and deletes conversations', async () => {
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
    if (method === 'GET' && url.endsWith('/api/v1/conversations')) {
      return json({
        conversations: [conversationSummary],
      });
    }
    if (method === 'GET' && url.endsWith(`/api/v1/conversations/${conversationId}`))
      return json({ ...conversationSummary, turns: [] });
    if (method === 'PATCH')
      return json({ ...conversationSummary, title: JSON.parse(String(init?.body)).title });
    if (method === 'DELETE')
      return new Response(null, { status: 204 });
    return new Response('{}', { status: 500 });
  });
  vi.stubGlobal('fetch', fetchMock);
  const getToken = async () => 'session-token';

  expect((await listConversations(getToken)).conversations).toEqual([conversationSummary]);
  expect((await getConversation(getToken, conversationId)).turns).toEqual([]);
  expect((await renameConversation(getToken, conversationId, 'Renamed')).title).toBe('Renamed');
  await deleteConversation(getToken, conversationId);

  const methods = fetchMock.mock.calls.map(([, init]) => (init?.method ?? 'GET').toUpperCase());
  expect(methods).toEqual(['GET', 'GET', 'PATCH', 'DELETE']);
  const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
  expect(headers.get('Authorization')).toBe('Bearer session-token');
});

it.each([404, 409])('turns a %i conversation problem into ApiError', async (status) => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ ...problem, status }), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  })));

  const error = await getConversation(async () => 'token', conversationId).catch((caught: unknown) => caught);

  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).problem.status).toBe(status);
});
