import { expect, it, vi } from 'vitest';
import {
  ApiError,
  createApiClient,
  deleteDocument,
  listDocuments,
  reingestDocument,
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
  const error = await client.v1.me.$get().then(() => {
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

    if (method === 'GET' && url.endsWith('/v1/documents')) {
      return new Response(JSON.stringify({
        documents: [documentDetail],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (method === 'POST' && url.endsWith('/v1/documents')) {
      return new Response(JSON.stringify(documentDetail), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (method === 'DELETE' && url.endsWith(`/v1/documents/${documentId}`)) {
      return new Response(null, { status: 204 });
    }

    if (method === 'POST' && url.endsWith(`/v1/documents/${documentId}/reingest`)) {
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
  expect(typeof client.v1.documents.$get).toBe('function');
  expect(typeof client.v1.documents.$post).toBe('function');
  expect(typeof client.v1.documents[':id'].$delete).toBe('function');
  expect(typeof client.v1.documents[':id'].reingest.$post).toBe('function');

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
  expect(urls.some(url => url.endsWith('/v1/documents'))).toBe(true);
  expect(urls.some(url => url.endsWith(`/v1/documents/${documentId}`))).toBe(true);
  expect(urls.some(url => url.endsWith(`/v1/documents/${documentId}/reingest`))).toBe(true);
});
