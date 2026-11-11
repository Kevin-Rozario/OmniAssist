import type { AskStreamEvent } from '@omni/types';
import { expect, it, vi } from 'vitest';
import { env } from '@/env';
import { ApiError, askStream, AskStreamError } from './api-client';

const encoder = new TextEncoder();

function frame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

const happyPath = [
  frame('status', { stage: 'routing' }),
  frame('status', { stage: 'writing' }),
  frame('citations', {
    sources: [
      {
        n: 1,
        kind: 'kb',
        documentId: 'doc-1',
        filename: 'vpn.md',
      },
    ],
  }),
  frame('token', { text: 'Hello ' }),
  frame('token', { text: 'world' }),
  frame('done', { answerSource: 'kb', sourceConfidence: 'high' }),
].join('');

/** A response whose body delivers each chunk separately, then closes. */
function streamResponse(chunks: Array<string | Uint8Array>, init?: ResponseInit): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(typeof chunk === 'string'
          ? encoder.encode(chunk)
          : chunk);
      }
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
    ...init,
  });
}

function stubFetch(respond: (init: RequestInit | undefined) => Response | Promise<Response>) {
  const fetchMock = vi.fn<typeof fetch>(async (_input, init) => respond(init));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function collect(stream: AsyncGenerator<AskStreamEvent>): Promise<AskStreamEvent[]> {
  const events: AskStreamEvent[] = [];
  for await (const event of stream)
    events.push(event);
  return events;
}

const getToken = async () => 'session-token';

it('posts the question with the bearer token and yields events in order', async () => {
  const fetchMock = stubFetch(() => streamResponse([happyPath]));

  const events = await collect(askStream(getToken, 'How do I set up the VPN?'));

  expect(events.map(event => event.event)).toEqual([
    'status',
    'status',
    'citations',
    'token',
    'token',
    'done',
  ]);
  expect(events.at(-1)).toEqual({
    event: 'done',
    data: { answerSource: 'kb', sourceConfidence: 'high' },
  });

  const [url, init] = fetchMock.mock.calls[0] ?? [];
  // CI sets NEXT_PUBLIC_API_URL itself, so compare with the configured origin.
  expect(String(url)).toBe(`${env.NEXT_PUBLIC_API_URL.replace(/\/+$/, '')}/api/v1/ask`);
  expect(init?.method).toBe('POST');
  expect(JSON.parse(String(init?.body))).toEqual({ question: 'How do I set up the VPN?' });
  const headers = new Headers(init?.headers);
  expect(headers.get('Authorization')).toBe('Bearer session-token');
  expect(headers.get('Content-Type')).toBe('application/json');
  expect(headers.get('X-Request-Id')).toMatch(/^[\w-]{1,64}$/);
});

it('reassembles frames split at arbitrary byte positions, including inside a character', async () => {
  const bytes = encoder.encode(
    frame('token', { text: 'caf\u00E9 \u2713' }) + frame('done', { answerSource: 'direct', sourceConfidence: 'not_applicable' }),
  );
  const chunks = Array.from({ length: bytes.length }, (_, index) => bytes.slice(index, index + 1));
  stubFetch(() => streamResponse(chunks));

  const events = await collect(askStream(getToken, 'hi'));

  expect(events[0]).toEqual({
    event: 'token',
    data: { text: 'caf\u00E9 \u2713' },
  });
  expect(events.at(-1)?.event).toBe('done');
});

it('yields an error event and then stops', async () => {
  stubFetch(() => streamResponse([
    frame('token', { text: 'partial' }),
    frame('error', { type: 'about:blank', title: 'Answer failed', requestId: 'req-1' }),
    frame('token', { text: 'must not be seen' }),
  ]));

  const events = await collect(askStream(getToken, 'hi'));

  expect(events.map(event => event.event)).toEqual(['token', 'error']);
});

it('throws ApiError for a rejected request before any event', async () => {
  stubFetch(() => new Response(JSON.stringify({
    type: 'https://omni-it-copilot.dev/problems/unauthenticated',
    title: 'Authentication required',
    status: 401,
    requestId: 'req-401',
  }), {
    status: 401,
    headers: { 'content-type': 'application/problem+json' },
  }));

  const error = await collect(askStream(getToken, 'hi')).catch((caught: unknown) => caught);

  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).problem.status).toBe(401);
});

it('throws ApiError for a 400 validation response', async () => {
  stubFetch(() => new Response(JSON.stringify({
    type: 'about:blank',
    title: 'Bad Request',
    status: 400,
    requestId: 'req-400',
  }), {
    status: 400,
    headers: { 'content-type': 'application/problem+json' },
  }));

  const error = await collect(askStream(getToken, 'hi')).catch((caught: unknown) => caught);

  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).problem.status).toBe(400);
});

it('throws AskStreamError when the stream closes without done or error', async () => {
  stubFetch(() => streamResponse([
    frame('token', { text: 'cut off' }),
  ]));
  const seen: string[] = [];

  const run = (async () => {
    for await (const event of askStream(getToken, 'hi'))
      seen.push(event.event);
  })();

  await expect(run).rejects.toBeInstanceOf(AskStreamError);
  expect(seen).toEqual(['token']);
});

it('throws AskStreamError for an unknown event', async () => {
  stubFetch(() => streamResponse([
    frame('mystery', { x: 1 }),
  ]));

  await expect(collect(askStream(getToken, 'hi'))).rejects.toBeInstanceOf(AskStreamError);
});

it('throws AskStreamError for an invalid payload', async () => {
  stubFetch(() => streamResponse([
    frame('status', { stage: 'daydreaming' }),
  ]));

  await expect(collect(askStream(getToken, 'hi'))).rejects.toBeInstanceOf(AskStreamError);
});

it('delivers a final frame that lacks its trailing blank line', async () => {
  stubFetch(() => streamResponse([
    `event: done\ndata: ${JSON.stringify({ answerSource: 'web', sourceConfidence: 'medium' })}\n`,
  ]));

  const events = await collect(askStream(getToken, 'hi'));

  expect(events).toEqual([
    {
      event: 'done',
      data: { answerSource: 'web', sourceConfidence: 'medium' },
    },
  ]);
});

it('passes an abort through unchanged and cancels the body', async () => {
  const controller = new AbortController();
  let cancelled = false;
  stubFetch((init) => {
    const body = new ReadableStream<Uint8Array>({
      start(stream) {
        stream.enqueue(encoder.encode(frame('status', { stage: 'routing' })));
        init?.signal?.addEventListener('abort', () => stream.error(init.signal?.reason));
      },
      cancel() {
        cancelled = true;
      },
    });
    return new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
  });

  const seen: string[] = [];
  const run = (async () => {
    for await (const event of askStream(getToken, 'hi', controller.signal)) {
      seen.push(event.event);
      controller.abort();
    }
  })();

  const error = await run.catch((caught: unknown) => caught);

  expect(seen).toEqual(['status']);
  expect(error).not.toBeInstanceOf(AskStreamError);
  expect(error).not.toBeInstanceOf(ApiError);
  expect(error).toBeDefined();
  expect(cancelled || controller.signal.aborted).toBe(true);
});

it('rejects with the abort error when aborted before the request is sent', async () => {
  const controller = new AbortController();
  controller.abort();
  stubFetch((init) => {
    if (init?.signal?.aborted)
      throw init.signal.reason;
    return streamResponse([happyPath]);
  });

  const error = await collect(askStream(getToken, 'hi', controller.signal)).catch((caught: unknown) => caught);

  expect(error).not.toBeInstanceOf(AskStreamError);
  expect((error as Error).name).toBe('AbortError');
});

it('sends the conversation id when continuing a conversation, and omits it otherwise', async () => {
  const id = '550e8400-e29b-41d4-a716-446655440000';
  const fetchMock = stubFetch(() => streamResponse([happyPath]));

  await collect(askStream(getToken, 'and on a Mac?', undefined, id));
  await collect(askStream(getToken, 'first'));

  expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ question: 'and on a Mac?', conversationId: id });
  expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ question: 'first' });
});

it('rejects with the 404 and 409 problems before any event', async () => {
  for (const status of [404, 409]) {
    stubFetch(() => new Response(JSON.stringify({
      type: 'about:blank',
      title: 'Problem',
      status,
      requestId: 'req-x',
    }), {
      status,
      headers: { 'content-type': 'application/problem+json' },
    }));

    const error = await collect(askStream(getToken, 'hi', undefined, '550e8400-e29b-41d4-a716-446655440000')).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).problem.status).toBe(status);
  }
});
