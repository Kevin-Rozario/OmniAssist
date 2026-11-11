import type { AskStreamEvent, ConversationDetail } from '@omni/types';
import type { ChatController } from './chat-controller';
import { ASK_QUESTION_MAX_LENGTH } from '@omni/types';
import { expect, it, vi } from 'vitest';
import { ApiError, AskStreamError } from './api-client';
import { createChatController } from './chat-controller';

type Item
  = | { type: 'event'; event: AskStreamEvent }
    | { type: 'end' }
    | { type: 'error'; error: unknown };

interface Call {
  question: string;
  conversationId: string | undefined;
  signal: AbortSignal;
  push: (event: AskStreamEvent) => void;
  end: () => void;
  fail: (error: unknown) => void;
}

/** A stream the test drives by hand. Honours abort unless told not to. */
function fakeStream({ honorAbort = true } = {}) {
  const calls: Call[] = [];
  const stream = vi.fn((question: string, signal: AbortSignal, conversationId: string | undefined) => {
    const queue: Item[] = [];
    let wake: (() => void) | undefined;
    const send = (item: Item) => {
      queue.push(item);
      wake?.();
    };
    calls.push({
      question,
      conversationId,
      signal,
      push: event => send({ type: 'event', event }),
      end: () => send({ type: 'end' }),
      fail: error => send({ type: 'error', error }),
    });
    if (honorAbort) {
      signal.addEventListener('abort', () => send({
        type: 'error',
        error: new DOMException('aborted', 'AbortError'),
      }));
    }

    return (async function* () {
      while (true) {
        while (queue.length === 0)
          await new Promise<void>((resolve) => { wake = resolve; });
        const item = queue.shift()!;
        if (item.type === 'event')
          yield item.event;
        else if (item.type === 'end')
          return;
        else
          throw item.error;
      }
    })();
  });
  return { stream, calls };
}

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

function status(stage: 'routing' | 'writing'): AskStreamEvent {
  return {
    event: 'status',
    data: { stage },
  };
}
function token(text: string): AskStreamEvent {
  return {
    event: 'token',
    data: { text },
  };
}
const done: AskStreamEvent = {
  event: 'done',
  data: { answerSource: 'kb', sourceConfidence: 'high' },
};
const citations: AskStreamEvent = {
  event: 'citations',
  data: {
    sources: [
      {
        n: 1,
        kind: 'kb',
        documentId: 'doc-1',
        filename: 'vpn.md',
      },
    ],
  },
};

function setup(options?: Parameters<typeof fakeStream>[0]) {
  const fake = fakeStream(options);
  let counter = 0;
  const controller = createChatController({
    stream: fake.stream,
    newId: () => `m${++counter}`,
  });
  return { controller, ...fake };
}

const first = (controller: ChatController) => controller.getState().messages[0];

it('streams an answer into the conversation and finishes', async () => {
  const { controller, calls } = setup();

  expect(controller.ask('How do I set up the VPN?')).toBe(true);
  expect(first(controller)).toMatchObject({ question: 'How do I set up the VPN?', status: 'streaming' });

  calls[0]?.push(status('routing'));
  await tick();
  expect(first(controller)?.stage).toBe('routing');

  calls[0]?.push(citations);
  calls[0]?.push(token('Install '));
  calls[0]?.push(token('the client.'));
  calls[0]?.push(done);
  await tick();

  expect(first(controller)).toMatchObject({
    status: 'done',
    text: 'Install the client.',
    answerSource: 'kb',
    confidence: 'high',
    sources: citations.event === 'citations'
      ? citations.data.sources
      : [],
  });
  expect(first(controller)?.stage).toBeUndefined();
});

it('notifies subscribers on changes and not after unsubscribing', async () => {
  const { controller, calls } = setup();
  const listener = vi.fn();
  const unsubscribe = controller.subscribe(listener);

  controller.ask('hi');
  expect(listener).toHaveBeenCalledTimes(1);

  unsubscribe();
  calls[0]?.push(token('x'));
  await tick();
  expect(listener).toHaveBeenCalledTimes(1);
});

it('sends the trimmed question on its own, and only that', async () => {
  const { controller, calls, stream } = setup();

  controller.ask('  first question  ');
  calls[0]?.push(done);
  await tick();
  controller.ask('second question');

  expect(stream.mock.calls.map(([question]) => question)).toEqual(['first question', 'second question']);
  // Earlier messages are never resent: the server keeps the conversation, the client sends its id.
  expect(stream.mock.calls[1]).toHaveLength(3);
  expect(stream.mock.calls[1]?.[2]).toBeUndefined();
});

it.each([
  ['an empty question', ''],
  ['a whitespace-only question', '  \n\t '],
  [
    'an over-limit question',
    'x'.repeat(ASK_QUESTION_MAX_LENGTH + 1),
  ],
])('sends nothing for %s', (_name, question) => {
  const { controller, stream } = setup();

  expect(controller.ask(question)).toBe(false);
  expect(stream).not.toHaveBeenCalled();
  expect(controller.getState().messages).toEqual([]);
});

it('accepts a question of exactly the limit', () => {
  const { controller } = setup();

  expect(controller.ask('x'.repeat(ASK_QUESTION_MAX_LENGTH))).toBe(true);
});

it('refuses a second question while one is being answered', () => {
  const { controller, stream } = setup();

  expect(controller.ask('one')).toBe(true);
  expect(controller.ask('two')).toBe(false);
  expect(stream).toHaveBeenCalledTimes(1);
});

it('keeps partial text and offers the answer_failed error with its request id', async () => {
  const { controller, calls } = setup();

  controller.ask('hi');
  calls[0]?.push(token('partial'));
  calls[0]?.push({
    event: 'error',
    data: { type: 'about:blank', title: 'Boom', requestId: 'req-7' },
  });
  await tick();

  expect(first(controller)).toMatchObject({
    status: 'error',
    text: 'partial',
    error: { kind: 'answer_failed', requestId: 'req-7' },
  });
  expect(controller.ask('again')).toBe(true);
});

it('maps a rejected request to a session-expired error', async () => {
  const { controller, calls } = setup();

  controller.ask('hi');
  calls[0]?.fail(new ApiError({
    type: 'about:blank',
    title: 'Authentication required',
    status: 401,
    requestId: 'req-1',
  }));
  await tick();

  expect(first(controller)).toMatchObject({
    status: 'error',
    error: { kind: 'session_expired', requestId: 'req-1' },
  });
});

it('maps a broken stream and a network failure', async () => {
  const { controller, calls } = setup();

  controller.ask('one');
  calls[0]?.fail(new AskStreamError('malformed'));
  await tick();
  expect(first(controller)?.error).toEqual({ kind: 'stream_failed' });

  controller.ask('two');
  calls[1]?.fail(new TypeError('Failed to fetch'));
  await tick();
  expect(controller.getState().messages[1]?.error).toEqual({ kind: 'unavailable' });
});

it('fails an answer whose stream ends without done or error', async () => {
  const { controller, calls } = setup();

  controller.ask('hi');
  calls[0]?.push(token('cut off'));
  calls[0]?.end();
  await tick();

  expect(first(controller)).toMatchObject({
    status: 'error',
    text: 'cut off',
    error: { kind: 'stream_failed' },
  });
});

it('stops mid-answer: aborts the request, keeps the text, and allows a new question', async () => {
  const { controller, calls } = setup();

  controller.ask('hi');
  calls[0]?.push(token('so far'));
  await tick();
  controller.stop();
  await tick();

  expect(calls[0]?.signal.aborted).toBe(true);
  expect(first(controller)).toMatchObject({ status: 'stopped', text: 'so far' });
  expect(controller.ask('next')).toBe(true);
});

it('ignores late events from a stopped answer even if the stream keeps sending', async () => {
  const { controller, calls } = setup({ honorAbort: false });

  controller.ask('hi');
  calls[0]?.push(token('kept'));
  await tick();
  controller.stop();
  calls[0]?.push(token(' late'));
  calls[0]?.push(done);
  await tick();

  expect(first(controller)).toMatchObject({ status: 'stopped', text: 'kept' });
});

it('does not treat a stop as a failure', async () => {
  const { controller } = setup();

  controller.ask('hi');
  controller.stop();
  await tick();

  expect(first(controller)?.status).toBe('stopped');
  expect(first(controller)?.error).toBeUndefined();
});

it('does nothing when stopping with no answer running', () => {
  const { controller } = setup();
  const listener = vi.fn();
  controller.subscribe(listener);

  controller.stop();

  expect(listener).not.toHaveBeenCalled();
});

it('retries a failed answer in its place with the same question', async () => {
  const { controller, calls, stream } = setup();

  controller.ask('original');
  calls[0]?.fail(new TypeError('offline'));
  await tick();
  controller.ask('second');
  calls[1]?.push(done);
  await tick();

  expect(controller.retry('m1')).toBe(true);
  expect(stream.mock.calls[2]?.[0]).toBe('original');
  expect(controller.getState().messages.map(message => message.id)).toEqual(['m3', 'm2']);
  expect(first(controller)).toMatchObject({ question: 'original', status: 'streaming' });

  calls[2]?.push(token('worked'));
  calls[2]?.push(done);
  await tick();
  expect(first(controller)).toMatchObject({ status: 'done', text: 'worked' });
});

it('only retries failed answers, and not while busy', async () => {
  const { controller, calls } = setup();

  controller.ask('one');
  expect(controller.retry('m1')).toBe(false);
  calls[0]?.push(done);
  await tick();
  expect(controller.retry('m1')).toBe(false);
  expect(controller.retry('missing')).toBe(false);

  controller.ask('two');
  calls[1]?.fail(new TypeError('offline'));
  await tick();
  controller.ask('three');
  expect(controller.retry('m2')).toBe(false);
});

it('starts a new chat mid-answer, aborts, and ignores late events', async () => {
  const { controller, calls } = setup({ honorAbort: false });

  controller.ask('hi');
  calls[0]?.push(token('x'));
  await tick();
  controller.newChat();
  calls[0]?.push(token('late'));
  calls[0]?.push(done);
  await tick();

  expect(calls[0]?.signal.aborted).toBe(true);
  expect(controller.getState().messages).toEqual([]);
  expect(controller.ask('fresh')).toBe(true);
});

it('aborts the request when the page goes away, without changing the conversation', async () => {
  const { controller, calls } = setup();
  const listener = vi.fn();

  controller.ask('hi');
  calls[0]?.push(token('x'));
  await tick();
  controller.subscribe(listener);
  controller.abort();
  await tick();

  expect(calls[0]?.signal.aborted).toBe(true);
  expect(listener).not.toHaveBeenCalled();
  expect(first(controller)).toMatchObject({ status: 'streaming', text: 'x' });
});

const CONVERSATION_ID = '550e8400-e29b-41d4-a716-446655440000';
const doneSaved: AskStreamEvent = {
  event: 'done',
  data: { answerSource: 'kb', sourceConfidence: 'high', conversationId: CONVERSATION_ID },
};

const saved: ConversationDetail = {
  id: CONVERSATION_ID,
  title: 'VPN',
  updatedAt: '2026-01-01T00:00:00.000Z',
  turns: [
    {
      id: '650e8400-e29b-41d4-a716-446655440001',
      question: 'How do I set up the VPN?',
      answer: 'Install the client [1].',
      answerSource: 'kb',
      sourceConfidence: 'high',
      sources: [
        {
          n: 1,
          kind: 'kb',
          documentId: 'doc-1',
          filename: 'vpn.md',
        },
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ],
};

it('sends the saved conversation id with a follow-up, but not with the first question', async () => {
  const { controller, calls } = setup();

  controller.ask('first');
  expect(calls[0]?.conversationId).toBeUndefined();
  calls[0]?.push(token('x'));
  calls[0]?.push(doneSaved);
  await tick();
  expect(controller.getState().conversationId).toBe(CONVERSATION_ID);

  controller.ask('and on a Mac?');
  expect(calls[1]?.conversationId).toBe(CONVERSATION_ID);
});

it('starts fresh after a failed first answer, because nothing was saved', async () => {
  const { controller, calls } = setup();

  controller.ask('first');
  calls[0]?.fail(new TypeError('offline'));
  await tick();
  expect(controller.getState().conversationId).toBeUndefined();

  expect(controller.retry('m1')).toBe(true);
  expect(calls[1]?.conversationId).toBeUndefined();
});

it('shows a saved conversation with sources and origin, and continues it', async () => {
  const { controller, calls } = setup();

  controller.open(saved);
  expect(controller.getState().messages).toEqual([
    {
      id: '650e8400-e29b-41d4-a716-446655440001',
      question: 'How do I set up the VPN?',
      status: 'done',
      text: 'Install the client [1].',
      sources: [
        {
          n: 1,
          kind: 'kb',
          documentId: 'doc-1',
          filename: 'vpn.md',
        },
      ],
      answerSource: 'kb',
      confidence: 'high',
    },
  ]);

  controller.ask('and on a Mac?');
  expect(calls[0]?.conversationId).toBe(CONVERSATION_ID);
});

it('stops a running answer before opening another conversation', async () => {
  const { controller, calls } = setup({ honorAbort: false });

  controller.ask('hi');
  calls[0]?.push(token('x'));
  await tick();
  controller.open(saved);
  calls[0]?.push(token('late'));
  calls[0]?.push(doneSaved);
  await tick();

  expect(calls[0]?.signal.aborted).toBe(true);
  expect(controller.getState().messages).toHaveLength(1);
  expect(controller.getState().messages[0]?.text).toBe('Install the client [1].');
  expect(controller.getState().conversationId).toBe(CONVERSATION_ID);
});

it('empties the screen and forgets the conversation on new chat', async () => {
  const { controller, calls } = setup();

  controller.open(saved);
  controller.newChat();
  expect(controller.getState()).toEqual({ messages: [] });

  controller.ask('fresh');
  expect(calls[0]?.conversationId).toBeUndefined();
});

it('returns to the empty state when the open conversation is deleted, even mid-answer', async () => {
  const { controller, calls } = setup({ honorAbort: false });

  controller.open(saved);
  controller.ask('more');
  calls[0]?.push(token('x'));
  await tick();
  controller.deleted(CONVERSATION_ID);

  expect(calls[0]?.signal.aborted).toBe(true);
  expect(controller.getState()).toEqual({ messages: [] });
});

it('leaves the screen alone when a different conversation is deleted', () => {
  const { controller } = setup();

  controller.open(saved);
  controller.deleted('750e8400-e29b-41d4-a716-446655440009');

  expect(controller.getState().conversationId).toBe(CONVERSATION_ID);
  expect(controller.getState().messages).toHaveLength(1);
});
