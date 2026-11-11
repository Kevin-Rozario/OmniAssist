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
import { createAskService, HISTORY_ANSWER_CHARS, titleFromQuestion } from '../src/modules/ask/service';
import { memoryConversationsRepo } from './memory-conversations-repo';

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
  repo?: ReturnType<typeof memoryConversationsRepo>;
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
  const repo = setup.repo ?? memoryConversationsRepo();
  let nextId = 0;
  return {
    generator,
    repo,
    graph,
    service: createAskService({
      graph,
      timeoutMs: setup.timeoutMs ?? 5000,
      conversations: repo,
      createId: () => `00000000-0000-4000-8000-${String(++nextId).padStart(12, '0')}`,
    }),
  };
}

const USER = 'user_member';

async function collect(
  service: ReturnType<typeof createAskService>,
  signal?: AbortSignal,
  logs = captureLogs(),
  conversation?: Awaited<ReturnType<ReturnType<typeof createAskService>['begin']>>,
) {
  const events: AskEvent[] = [];
  for await (const event of service.ask(QUESTION, {
    userId: USER,
    conversation,
    signal,
    logger: logs.logger,
    requestId: 'req-1',
  }))
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
    expect(events.at(-1)).toMatchObject({ type: 'done', answerSource: 'kb', sourceConfidence: 'high' });
    expect(events.flatMap(e => (e.type === 'token'
      ? [e.text]
      : [])).join('')).toBe(ANSWER_CHUNKS.join(''));
  });

  it('answers from the web, with citations, when the knowledge base is weak', async () => {
    const { service } = build({ kbGood: false });
    const { events } = await collect(service);

    expect(names(events)).toContain('citations');
    expect(events.at(-1)).toMatchObject({ type: 'done', answerSource: 'web', sourceConfidence: 'medium' });
  });

  it('answers with a labelled fallback and no citations when nothing is usable', async () => {
    const { service } = build({ kbGood: false, web: [] });
    const { events } = await collect(service);

    expect(names(events)).not.toContain('citations');
    expect(events.at(-1)).toMatchObject({ type: 'done', answerSource: 'fallback', sourceConfidence: 'low' });
  });

  it('answers directly with no retrieval', async () => {
    const { service } = build({ route: 'direct' });
    const { events } = await collect(service);

    expect(names(events)).not.toContain('citations');
    expect(events.at(-1)).toMatchObject({
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
      userId: USER,
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

function turnOf(n: number, answer = `a${n}`) {
  return {
    id: `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    question: `q${n}`,
    answer,
    answerSource: 'kb' as const,
    sourceConfidence: 'high' as const,
    sources: [],
  };
}

describe('ask service conversations', () => {
  it('saves a new conversation before done and reports its id', async () => {
    const { service, repo } = build();
    const conversation = await service.begin(USER, undefined);
    const { events } = await collect(service, undefined, undefined, conversation);

    const done = events.at(-1);
    expect(done).toMatchObject({ type: 'done', conversationId: '00000000-0000-4000-8000-000000000002' });
    const saved = await repo.get(USER, (done as { conversationId: string }).conversationId);
    expect(saved?.turns).toHaveLength(1);
    expect(saved?.turns[0]).toMatchObject({
      question: QUESTION,
      answer: ANSWER_CHUNKS.join(''),
      answerSource: 'kb',
      sourceConfidence: 'high',
      sources: [
        { n: 1, kind: 'kb', filename: 'vpn-guide.md' },
      ],
    });
    expect(saved?.title).toBe(QUESTION);
  });

  it('continues an existing conversation, keeping its id and adding the next turn', async () => {
    const repo = memoryConversationsRepo();
    await repo.create(USER, {
      id: '20000000-0000-4000-8000-000000000001',
      title: 'old',
      turn: turnOf(1),
    });
    const { service, graph } = build({ repo });
    const spy: unknown[] = [];
    const original = graph.stream.bind(graph);
    (graph as { stream: unknown }).stream = (input: unknown, config: never) => {
      spy.push(input);
      return original(input as never, config);
    };

    const conversation = await service.begin(USER, '20000000-0000-4000-8000-000000000001');
    expect(conversation.history).toEqual([
      { question: 'q1', answer: 'a1' },
    ]);
    const { events } = await collect(service, undefined, undefined, conversation);

    expect(events.at(-1)).toMatchObject({ type: 'done', conversationId: '20000000-0000-4000-8000-000000000001' });
    const saved = await repo.get(USER, '20000000-0000-4000-8000-000000000001');
    expect(saved?.turns.map(t => t.position)).toEqual([1, 2]);
    expect(saved?.title).toBe('old');
    expect(spy[0]).toMatchObject({
      question: QUESTION,
      history: [
        { question: 'q1', answer: 'a1' },
      ],
    });
  });

  it('uses only the six most recent exchanges and bounds long answers', async () => {
    const repo = memoryConversationsRepo();
    const id = '20000000-0000-4000-8000-000000000002';
    await repo.create(USER, {
      id,
      title: 't',
      turn: turnOf(1),
    });
    for (let n = 2; n <= 8; n++) {
      await repo.appendTurn(USER, id, turnOf(n, n === 8
        ? 'x'.repeat(HISTORY_ANSWER_CHARS + 500)
        : `a${n}`), 100);
    }
    const { service } = build({ repo });

    const { history } = await service.begin(USER, id);

    expect(history.map(h => h.question)).toEqual(['q3', 'q4', 'q5', 'q6', 'q7', 'q8']);
    expect(history.at(-1)?.answer.length).toBe(HISTORY_ANSWER_CHARS + 1);
  });

  it('refuses unknown, foreign and full conversations before any work', async () => {
    const repo = memoryConversationsRepo();
    const id = '20000000-0000-4000-8000-000000000003';
    await repo.create('someone_else', {
      id,
      title: 't',
      turn: turnOf(1),
    });
    const { service } = build({ repo });
    await expect(service.begin(USER, id)).rejects.toMatchObject({ status: 404 });
    await expect(service.begin(USER, '20000000-0000-4000-8000-000000000099')).rejects.toMatchObject({ status: 404 });

    const full = '20000000-0000-4000-8000-000000000004';
    await repo.create(USER, {
      id: full,
      title: 't',
      turn: turnOf(1),
    });
    for (let n = 2; n <= 100; n++)
      await repo.appendTurn(USER, full, turnOf(n), 100);
    await expect(service.begin(USER, full)).rejects.toMatchObject({ status: 409 });
  });

  it('saves nothing when the answer fails or the client cancels', async () => {
    const repo = memoryConversationsRepo();
    const failing = build({
      repo,
      generator: fakeGenerator(ANSWER_CHUNKS, { failAfter: 1 }),
    });
    const { events } = await collect(failing.service);
    expect(events.at(-1)?.type).toBe('error');
    expect(await repo.list(USER)).toEqual([]);

    const cancelling = build({
      repo,
      generator: fakeGenerator(['a', 'b', 'c', 'd']),
    });
    const controller = new AbortController();
    const logs = captureLogs();
    for await (const event of cancelling.service.ask(QUESTION, {
      userId: USER,
      signal: controller.signal,
      logger: logs.logger,
      requestId: 'r',
    })) {
      if (event.type === 'token')
        controller.abort();
    }
    expect(await repo.list(USER)).toEqual([]);
  });

  it('ends with a sanitized error and no done when saving fails', async () => {
    const repo = memoryConversationsRepo();
    repo.create = async () => {
      throw new Error(`db down while saving ${QUESTION}`);
    };
    const { service } = build({ repo });
    const { events, logs } = await collect(service);

    expect(events.at(-1)).toEqual({
      type: 'error',
      error: {
        type: 'https://omni-it-copilot.dev/problems/upstream',
        title: 'Upstream service failed',
        requestId: 'req-1',
      },
    });
    expect(names(events)).not.toContain('done');
    expect(JSON.stringify(events)).not.toContain('db down');
    expect(logs.lines.join('\n')).not.toContain('zebra-quartz');
  });

  it('titles from the first question, shortened with an ellipsis past 60 characters', () => {
    expect(titleFromQuestion('  How do I\n reset it?  ')).toBe('How do I reset it?');
    const title = titleFromQuestion('a'.repeat(100));
    expect(title).toHaveLength(60);
    expect(title.endsWith('…')).toBe(true);
    expect(titleFromQuestion('a'.repeat(60))).toBe('a'.repeat(60));
  });

  it('keeps conversation ids and no text in the saved log line', async () => {
    const { service } = build();
    const { logs } = await collect(service);
    const output = logs.lines.join('\n');
    expect(output).toContain('conversation saved');
    expect(output).not.toContain('marmalade');
    expect(output).not.toContain('zebra-quartz');
  });
});
