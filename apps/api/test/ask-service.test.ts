import type { AskEvent } from '@omni/rag-graph';
import type { Logger } from '../src/lib/logger';
import { Writable } from 'node:stream';
import { createRagGraph } from '@omni/rag-graph';
import {
  fakeClassifier,
  fakeGenerator,
  fakeRetriever,
  fakeWebSearch,
  GOOD_GRADE,
  kbPassage,
  OFF_TOPIC_GRADE,
  webResult,
} from '@omni/rag-graph/test-support';
import { describe, expect, it } from 'vitest';
import { createLogger } from '../src/lib/logger';
import { createAskService } from '../src/modules/ask/service';

const QUESTION = 'How do I rotate the zebra-quartz credentials?';
const PASSAGE_TEXT = 'Rotate zebra-quartz credentials from the vault console.';
const WEB_TEXT = 'Public mauve-falcon guidance for credentials.';
const ANSWER_CHUNKS = ['The secret ', 'answer is marmalade.'];

function captureLogs() {
  const lines: string[] = [];
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(...String(chunk).split('\n').filter(Boolean));
      callback();
    },
  });
  const logger: Logger = createLogger({ level: 'debug', destination });
  return { logger, lines };
}

interface Setup {
  route?: 'kb' | 'direct';
  kb?: ReturnType<typeof kbPassage>[];
  kbGood?: boolean;
  web?: ReturnType<typeof webResult>[];
  generator?: ReturnType<typeof fakeGenerator>;
  timeoutMs?: number;
}

function build(setup: Setup = {}) {
  const generator = setup.generator ?? fakeGenerator(ANSWER_CHUNKS);
  const classifier = fakeClassifier({
    route: { label: setup.route ?? 'kb', confidence: 0.95 },
    grade: (passage) => {
      const kbIsGood = passage.text === PASSAGE_TEXT && setup.kbGood !== false;
      return kbIsGood || passage.text === WEB_TEXT
        ? GOOD_GRADE
        : OFF_TOPIC_GRADE;
    },
  });
  const graph = createRagGraph({
    classifier,
    retriever: fakeRetriever(setup.kb ?? [
      kbPassage({ text: PASSAGE_TEXT }),
    ]),
    webSearch: fakeWebSearch(setup.web ?? [
      webResult({ content: WEB_TEXT }),
    ]),
    generator,
  });
  return {
    generator,
    service: createAskService({ graph, timeoutMs: setup.timeoutMs ?? 5000 }),
  };
}

async function collect(
  service: ReturnType<typeof createAskService>,
  signal?: AbortSignal,
  logs = captureLogs(),
) {
  const events: AskEvent[] = [];
  for await (const event of service.ask(QUESTION, { signal, logger: logs.logger, requestId: 'req-1' }))
    events.push(event);
  return { events, logs };
}

const names = (events: AskEvent[]) => events.map(event => event.type);

describe('ask service event sequences', () => {
  it('streams status, citations, tokens and done for a knowledge-base answer', async () => {
    const { service } = build();
    const { events } = await collect(service);

    expect(names(events)).toEqual([
      'status',
      'status',
      'status',
      'status',
      'citations',
      'token',
      'token',
      'done',
    ]);
    expect(events.at(-1)).toEqual({ type: 'done', answerSource: 'kb', sourceConfidence: 'high' });
    expect(events.flatMap(e => (e.type === 'token'
      ? [e.text]
      : [])).join('')).toBe(ANSWER_CHUNKS.join(''));
  });

  it('answers from the web, with citations, when the knowledge base is weak', async () => {
    const { service } = build({ kbGood: false });
    const { events } = await collect(service);

    expect(names(events)).toContain('citations');
    expect(events.at(-1)).toEqual({ type: 'done', answerSource: 'web', sourceConfidence: 'medium' });
  });

  it('answers with a labelled fallback and no citations when nothing is usable', async () => {
    const { service } = build({ kbGood: false, web: [] });
    const { events } = await collect(service);

    expect(names(events)).not.toContain('citations');
    expect(events.at(-1)).toEqual({ type: 'done', answerSource: 'fallback', sourceConfidence: 'low' });
  });

  it('answers directly with no retrieval', async () => {
    const { service } = build({ route: 'direct' });
    const { events } = await collect(service);

    expect(names(events)).not.toContain('citations');
    expect(events.at(-1)).toEqual({
      type: 'done',
      answerSource: 'direct',
      sourceConfidence: 'not_applicable',
    });
  });
});

describe('ask service failures', () => {
  it('ends with a sanitized error and no done when generation fails mid-answer', async () => {
    // Real providers pause between tokens, so the consumer sees the first token before the failure.
    const generator = {
      stream: () => (async function* () {
        yield ANSWER_CHUNKS[0]!;
        await new Promise(resolve => setTimeout(resolve, 10));
        throw new Error('provider says sk-live-SECRET and quotes your passage');
      })(),
    } as unknown as ReturnType<typeof fakeGenerator>;
    const { service } = build({ generator });
    const { events, logs } = await collect(service);

    const last = events.at(-1);
    expect(last).toEqual({
      type: 'error',
      error: {
        type: 'https://omni-it-copilot.dev/problems/upstream',
        title: 'Upstream service failed',
        requestId: 'req-1',
      },
    });
    expect(names(events)).not.toContain('done');
    expect(names(events)).toContain('token');
    expect(JSON.stringify(events)).not.toContain('SECRET');
    expect(logs.lines.join('\n')).not.toContain('SECRET');
  });

  it('yields an error event when the deadline expires', async () => {
    const hanging = {
      stream: (request: { signal?: AbortSignal }) => (async function* () {
        await new Promise<void>((_resolve, reject) => {
          request.signal?.addEventListener('abort', () => reject(request.signal?.reason));
        });
        yield 'never';
      })(),
    };
    const { service } = build({
      generator: hanging as unknown as ReturnType<typeof fakeGenerator>,
      timeoutMs: 30,
    });
    const { events, logs } = await collect(service);

    expect(events.at(-1)).toEqual({
      type: 'error',
      error: {
        type: 'https://omni-it-copilot.dev/problems/service-unavailable',
        title: 'The answer took too long',
        requestId: 'req-1',
      },
    });
    expect(names(events)).not.toContain('done');
    expect(logs.lines.join('\n')).toContain('"cause":"timeout"');
  });

  it('ends silently, with no error event, when the client cancels', async () => {
    const { service, generator } = build({
      generator: fakeGenerator(['a', 'b', 'c', 'd']),
    });
    const controller = new AbortController();
    const events: AskEvent[] = [];
    const logs = captureLogs();

    for await (const event of service.ask(QUESTION, {
      signal: controller.signal,
      logger: logs.logger,
      requestId: 'req-1',
    })) {
      events.push(event);
      if (event.type === 'token')
        controller.abort();
    }

    expect(names(events)).not.toContain('error');
    expect(names(events)).not.toContain('done');
    expect(generator.closed).toBe(1);
  });
});

describe('ask service log hygiene', () => {
  it('logs structure but none of the question, passage or answer text', async () => {
    const { service } = build();
    const { logs } = await collect(service);

    const output = logs.lines.join('\n');
    expect(output).toContain('ask completed');
    for (const forbidden of [
      'zebra-quartz',
      'marmalade',
      PASSAGE_TEXT,
      QUESTION,
      ...ANSWER_CHUNKS,
    ])
      expect(output).not.toContain(forbidden);

    const entry = JSON.parse(logs.lines.find(line => line.includes('ask completed'))!) as Record<string, unknown>;
    expect(entry).toMatchObject({
      route: 'kb',
      kbVerdict: 'good',
      answerSource: 'kb',
    });
    expect(entry.stageMs).toBeTypeOf('object');
  });

  it('logs the failure cause and stage but no text on a web-search and answer failure', async () => {
    const generator = fakeGenerator(ANSWER_CHUNKS, {
      failAfter: 0,
      error: new Error(QUESTION),
    });
    const { service } = build({ generator, kbGood: false });
    const { logs } = await collect(service);

    const output = logs.lines.join('\n');
    expect(output).toContain('ask failed');
    expect(output).toContain('"stage":"writing"');
    expect(output).not.toContain('zebra-quartz');
  });
});
