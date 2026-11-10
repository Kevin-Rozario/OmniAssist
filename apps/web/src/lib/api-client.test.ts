import { expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from './api-client';

const problem = {
  type: 'https://omni-it-copilot.dev/problems/unauthenticated',
  title: 'Authentication required',
  status: 401,
  requestId: 'req-test',
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
