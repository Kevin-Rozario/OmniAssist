import type { AskEvent } from '@omni/rag-graph';
import type { AskOptions, AskService } from '../src/modules/ask/service';
import { ProblemDetailsSchema } from '@omni/types';
import { describe, expect, it } from 'vitest';
import { buildTestApp, fakeVerifier } from './harness';

const sessions = {
  'member-token': { userId: 'user_member', role: 'member' as const },
  'admin-token': { userId: 'user_admin', role: 'admin' as const },
};

const KB_EVENTS: AskEvent[] = [
  { type: 'status', stage: 'routing' },
  { type: 'status', stage: 'searching_kb' },
  { type: 'status', stage: 'grading' },
  { type: 'status', stage: 'writing' },
  {
    type: 'citations',
    sources: [
      {
        n: 1,
        kind: 'kb',
        documentId: 'doc-1',
        filename: 'vpn.md',
      },
    ],
  },
  { type: 'token', text: 'Install ' },
  { type: 'token', text: 'the client.' },
  { type: 'done', answerSource: 'kb', sourceConfidence: 'high' },
];

const FALLBACK_EVENTS: AskEvent[] = [
  { type: 'status', stage: 'routing' },
  { type: 'status', stage: 'writing' },
  { type: 'token', text: 'I could not find that.' },
  { type: 'done', answerSource: 'fallback', sourceConfidence: 'low' },
];

function scriptedService(events: AskEvent[] | (() => AsyncIterable<AskEvent>)) {
  const calls: Array<{ question: string; options: AskOptions }> = [];
  const service: AskService = {
    ask: (question, options) => {
      calls.push({ question, options });
      if (typeof events === 'function')
        return events();
      return (async function* () {
        for (const event of events)
          yield event;
      })();
    },
  };
  return { service, calls };
}

function buildAskApp(service: AskService) {
  return buildTestApp({
    verifier: fakeVerifier(sessions),
    askService: service,
  });
}

function post(
  app: ReturnType<typeof buildTestApp>['app'],
  body: string | undefined,
  options: { token?: string; contentType?: string; signal?: AbortSignal } = {},
) {
  const headers: Record<string, string> = {};
  if (options.token !== null)
    headers.Authorization = `Bearer ${options.token ?? 'member-token'}`;
  if (options.contentType)
    headers['Content-Type'] = options.contentType;
  return app.request('/v1/ask', {
    method: 'POST',
    headers,
    body,
    signal: options.signal,
  });
}

const askJson = (question: unknown) => JSON.stringify({ question });
const JSON_TYPE = { contentType: 'application/json' };

interface Frame { event: string; data: unknown }

function parseFrames(text: string): Frame[] {
  return text.split('\n\n').filter(Boolean).map((block) => {
    const lines = block.split('\n');
    const event = lines.find(line => line.startsWith('event:'))!.slice('event:'.length).trim();
    const data = lines.find(line => line.startsWith('data:'))!.slice('data:'.length).trim();
    return {
      event,
      data: JSON.parse(data) as unknown,
    };
  });
}

describe('post /v1/ask authentication', () => {
  it('rejects a request without a token and starts no processing', async () => {
    const { service, calls } = scriptedService(KB_EVENTS);
    const { app } = buildAskApp(service);
    const res = await app.request('/v1/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: askJson('hello'),
    });

    expect(res.status).toBe(401);
    expect(res.headers.get('Content-Type')).toContain('application/problem+json');
    expect(calls).toHaveLength(0);
  });

  it.each(['member-token', 'admin-token'])('streams for %s', async (token) => {
    const { service } = scriptedService(KB_EVENTS);
    const { app } = buildAskApp(service);
    const res = await post(app, askJson('How do I set up the VPN?'), { ...JSON_TYPE, token });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
    expect(res.headers.get('X-Request-Id')).toBeTruthy();
    await res.text();
  });
});

describe('post /v1/ask validation', () => {
  it.each([
    [
      'empty',
      askJson(''),
    ],
    [
      'whitespace only',
      askJson('   \n\t '),
    ],
    [
      '2001 characters',
      askJson('a'.repeat(2001)),
    ],
    [
      'wrong type',
      askJson(42),
    ],
    [
      'missing field',
      JSON.stringify({}),
    ],
  ])('rejects a %s question naming the field, with no service call', async (_name, body) => {
    const { service, calls } = scriptedService(KB_EVENTS);
    const { app } = buildAskApp(service);
    const res = await post(app, body, JSON_TYPE);

    expect(res.status).toBe(400);
    expect(res.headers.get('Content-Type')).toContain('application/problem+json');
    const problem = await res.json() as { errors: Array<{ path: string }> };
    expect(problem.errors.map(error => error.path)).toContain('question');
    expect(calls).toHaveLength(0);
  });

  it.each([
    ['no body', undefined, undefined],
    ['malformed JSON', '{not json', 'application/json'],
    ['a non-JSON content type', 'question=hi', 'text/plain'],
  ])('rejects %s with problem+json and no service call', async (_name, body, contentType) => {
    const { service, calls } = scriptedService(KB_EVENTS);
    const { app } = buildAskApp(service);
    const res = await post(app, body, { contentType });

    expect(res.status).toBe(400);
    expect(res.headers.get('Content-Type')).toContain('application/problem+json');
    expect(ProblemDetailsSchema.safeParse(await res.json()).success).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('accepts a 2000-character question and passes it trimmed', async () => {
    const { service, calls } = scriptedService(KB_EVENTS);
    const { app } = buildAskApp(service);
    const res = await post(app, askJson(`  ${'a'.repeat(2000)}  `), JSON_TYPE);

    expect(res.status).toBe(200);
    await res.text();
    expect(calls[0]?.question).toBe('a'.repeat(2000));
  });
});

describe('post /v1/ask event stream', () => {
  it('sends status, citations, tokens and done in order with SSE headers', async () => {
    const { service } = scriptedService(KB_EVENTS);
    const { app } = buildAskApp(service);
    const res = await post(app, askJson('How do I set up the VPN?'), JSON_TYPE);

    expect(res.headers.get('Cache-Control')).toBe('no-cache');
    expect(res.headers.get('X-Accel-Buffering')).toBe('no');

    const frames = parseFrames(await res.text());
    expect(frames.map(frame => frame.event)).toEqual([
      'status',
      'status',
      'status',
      'status',
      'citations',
      'token',
      'token',
      'done',
    ]);
    expect(frames[0]!.data).toEqual({ stage: 'routing' });
    expect(frames.flatMap(f => (f.event === 'token'
      ? [(f.data as { text: string }).text]
      : [])).join('')).toBe('Install the client.');
    expect(frames.at(-1)!.data).toEqual({ answerSource: 'kb', sourceConfidence: 'high' });
  });

  it('omits citations for a fallback answer', async () => {
    const { service } = scriptedService(FALLBACK_EVENTS);
    const { app } = buildAskApp(service);
    const frames = parseFrames(await (await post(app, askJson('obscure'), JSON_TYPE)).text());

    expect(frames.map(frame => frame.event)).not.toContain('citations');
    expect(frames.at(-1)!.data).toEqual({ answerSource: 'fallback', sourceConfidence: 'low' });
  });

  it('forwards the service error event as the last frame with no done after it', async () => {
    const { service } = scriptedService([
      { type: 'status', stage: 'routing' },
      {
        type: 'error',
        error: { type: 'https://omni-it-copilot.dev/problems/upstream', title: 'Upstream service failed', requestId: 'r1' },
      },
    ]);
    const { app } = buildAskApp(service);
    const frames = parseFrames(await (await post(app, askJson('q'), JSON_TYPE)).text());

    expect(frames.map(frame => frame.event)).toEqual(['status', 'error']);
    expect(frames[1]!.data).toEqual({
      type: 'https://omni-it-copilot.dev/problems/upstream',
      title: 'Upstream service failed',
      requestId: 'r1',
    });
  });

  it('turns a throwing service into a sanitized error event with the request ID', async () => {
    const { service } = scriptedService(() => (async function* () {
      yield { type: 'token', text: 'partial' } as AskEvent;
      throw new Error('provider exploded: sk-live-SECRET\n    at stack.frame (file.ts:1:1)');
    })());
    const { app, log } = buildAskApp(service);
    const res = await post(app, askJson('q'), JSON_TYPE);
    const text = await res.text();
    const frames = parseFrames(text);

    expect(frames.map(frame => frame.event)).toEqual(['token', 'error']);
    expect(frames.at(-1)!.data).toEqual({
      type: 'https://omni-it-copilot.dev/problems/internal',
      title: 'Internal server error',
      requestId: res.headers.get('X-Request-Id'),
    });
    expect(text).not.toContain('SECRET');
    expect(text).not.toContain('stack.frame');
    expect(text).not.toContain('done');
    expect(log.lines.join('\n')).not.toContain('"question"');
  });

  it('passes the request ID and a live signal to the service', async () => {
    const { service, calls } = scriptedService(KB_EVENTS);
    const { app } = buildAskApp(service);
    const res = await post(app, askJson('q'), JSON_TYPE);
    await res.text();

    expect(calls[0]!.options.requestId).toBe(res.headers.get('X-Request-Id'));
    expect(calls[0]!.options.signal).toBeInstanceOf(AbortSignal);
  });

  it('aborts the service work when the client disconnects', async () => {
    let seenSignal: AbortSignal | undefined;
    let finished = false;
    const { service } = scriptedService(() => (async function* () {
      yield { type: 'status', stage: 'routing' } as AskEvent;
      await new Promise<void>(resolve => seenSignal?.addEventListener('abort', () => resolve()));
      finished = true;
    })());
    const wrapped: AskService = {
      ask: (question, options) => {
        seenSignal = options.signal;
        return service.ask(question, options);
      },
    };
    const { app } = buildAskApp(wrapped);
    const controller = new AbortController();
    const res = await post(app, askJson('q'), { ...JSON_TYPE, signal: controller.signal });

    const reader = res.body!.getReader();
    await reader.read();
    expect(seenSignal?.aborted).toBe(false);

    controller.abort();
    await reader.cancel().catch(() => {});
    await expect.poll(() => seenSignal?.aborted).toBe(true);
    await expect.poll(() => finished).toBe(true);
  });
});

describe('openAPI documentation of /v1/ask', () => {
  it('lists the path with its request schema, event stream and problem responses', async () => {
    const { app } = buildTestApp();
    const doc = await (await app.request('/openapi.json')).json() as {
      paths: Record<string, {
        post?: {
          requestBody?: { content: Record<string, { schema: unknown }> };
          responses: Record<string, { description: string; content?: Record<string, unknown> }>;
        };
      }>;
    };

    const operation = doc.paths['/v1/ask']?.post;
    expect(operation).toBeDefined();

    const schema = operation!.requestBody!.content['application/json']!.schema as {
      properties: { question: { maxLength?: number; minLength?: number } };
      required: string[];
    };
    expect(schema.required).toContain('question');
    expect(schema.properties.question.maxLength).toBe(2000);

    expect(operation!.responses['200']!.content).toHaveProperty(['text/event-stream']);
    for (const event of [
      'status',
      'citations',
      'token',
      'done',
      'error',
    ])
      expect(operation!.responses['200']!.description).toContain(`\`${event}\``);
    for (const status of ['400', '401'])
      expect(operation!.responses[status]!.content).toHaveProperty(['application/problem+json']);
  });
});
