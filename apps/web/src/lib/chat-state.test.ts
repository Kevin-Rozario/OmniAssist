import type { ChatAction, ChatState } from './chat-state';
import { expect, it } from 'vitest';
import { chatReducer, initialChatState, isChatBusy } from './chat-state';

function run(...actions: ChatAction[]): ChatState {
  return actions.reduce(chatReducer, initialChatState);
}

const submit = (id: string, question = `question ${id}`): ChatAction => ({ type: 'submit', id, question });
const token = (id: string, text: string): ChatAction => ({ type: 'token', id, text });
const kbSource = {
  n: 1,
  kind: 'kb',
  documentId: 'doc-1',
  filename: 'vpn.md',
} as const;

it('adds a streaming message on submit', () => {
  const state = run(submit('a', 'How do I reset my password?'));

  expect(state.messages).toEqual([
    {
      id: 'a',
      question: 'How do I reset my password?',
      status: 'streaming',
      text: '',
      sources: [],
    },
  ]);
  expect(isChatBusy(state)).toBe(true);
});

it('ignores a submit while an answer is in progress', () => {
  const state = run(submit('a'), submit('b'));

  expect(state.messages.map(message => message.id)).toEqual(['a']);
});

it('allows the next question once the answer has ended', () => {
  const state = run(
    submit('a'),
    {
      type: 'done',
      id: 'a',
      answerSource: 'direct',
      confidence: 'not_applicable',
    },
    submit('b'),
  );

  expect(state.messages.map(message => message.id)).toEqual(['a', 'b']);
});

it('shows the stage, then clears it with the first token', () => {
  const waiting = run(submit('a'), { type: 'status', id: 'a', stage: 'searching_kb' });
  expect(waiting.messages[0]?.stage).toBe('searching_kb');

  const writing = chatReducer(waiting, token('a', 'Hi'));
  expect(writing.messages[0]?.stage).toBeUndefined();
  expect(writing.messages[0]?.text).toBe('Hi');
});

it('does not bring the stage back once text has started', () => {
  const state = run(submit('a'), token('a', 'Hi'), { type: 'status', id: 'a', stage: 'writing' });

  expect(state.messages[0]?.stage).toBeUndefined();
});

it('joins tokens in order', () => {
  const state = run(submit('a'), token('a', 'Hello '), token('a', 'wor'), token('a', 'ld'));

  expect(state.messages[0]?.text).toBe('Hello world');
});

it('stores citations', () => {
  const state = run(submit('a'), {
    type: 'citations',
    id: 'a',
    sources: [kbSource],
  });

  expect(state.messages[0]?.sources).toEqual([kbSource]);
});

it('completes with source and confidence and drops the stage', () => {
  const state = run(
    submit('a'),
    { type: 'status', id: 'a', stage: 'routing' },
    {
      type: 'done',
      id: 'a',
      answerSource: 'kb',
      confidence: 'high',
    },
  );

  expect(state.messages[0]).toMatchObject({ status: 'done', answerSource: 'kb', confidence: 'high' });
  expect(state.messages[0]?.stage).toBeUndefined();
  expect(isChatBusy(state)).toBe(false);
});

it('keeps partial text when the answer fails', () => {
  const state = run(
    submit('a'),
    token('a', 'partial'),
    {
      type: 'fail',
      id: 'a',
      error: { kind: 'answer_failed', requestId: 'req-1' },
    },
  );

  expect(state.messages[0]).toMatchObject({
    status: 'error',
    text: 'partial',
    error: { kind: 'answer_failed', requestId: 'req-1' },
  });
  expect(isChatBusy(state)).toBe(false);
});

it('keeps partial text when the answer is stopped', () => {
  const state = run(submit('a'), token('a', 'so far'), { type: 'stop', id: 'a' });

  expect(state.messages[0]).toMatchObject({ status: 'stopped', text: 'so far' });
  expect(isChatBusy(state)).toBe(false);
});

it('ignores every event after the answer has ended', () => {
  const failed = run(
    submit('a'),
    token('a', 'x'),
    {
      type: 'fail',
      id: 'a',
      error: { kind: 'stream_failed' },
    },
  );

  const after = [
    token('a', 'late'),
    { type: 'status', id: 'a', stage: 'writing' },
    {
      type: 'citations',
      id: 'a',
      sources: [kbSource],
    },
    {
      type: 'done',
      id: 'a',
      answerSource: 'kb',
      confidence: 'high',
    },
    { type: 'stop', id: 'a' },
    {
      type: 'fail',
      id: 'a',
      error: { kind: 'unavailable' },
    },
  ] satisfies ChatAction[];

  for (const action of after)
    expect(chatReducer(failed, action)).toBe(failed);
});

it('ignores events for an unknown message', () => {
  const state = run(submit('a'));

  expect(chatReducer(state, token('ghost', 'x'))).toBe(state);
});

it('replaces a failed message in place on retry', () => {
  const failed = run(
    submit('a', 'first'),
    {
      type: 'fail',
      id: 'a',
      error: { kind: 'unavailable' },
    },
    submit('b', 'second'),
    {
      type: 'done',
      id: 'b',
      answerSource: 'direct',
      confidence: 'not_applicable',
    },
  );

  const state = chatReducer(failed, {
    type: 'submit',
    id: 'c',
    question: 'first',
    replaces: 'a',
  });

  expect(state.messages.map(message => message.id)).toEqual(['c', 'b']);
  expect(state.messages[0]).toMatchObject({ question: 'first', status: 'streaming', text: '' });
});

it('appends on retry when the message to replace is gone', () => {
  const state = run(submit('a'), { type: 'newChat' }, {
    type: 'submit',
    id: 'b',
    question: 'q',
    replaces: 'a',
  });

  expect(state.messages.map(message => message.id)).toEqual(['b']);
});

it('starts a new chat, even mid-answer, and then ignores late events', () => {
  const cleared = run(submit('a'), token('a', 'x'), { type: 'newChat' });

  expect(cleared).toBe(initialChatState);
  expect(chatReducer(cleared, token('a', 'late'))).toBe(cleared);
  expect(isChatBusy(cleared)).toBe(false);
});

it('does not mutate the previous state', () => {
  const before = run(submit('a'));
  const snapshot = structuredClone(before);

  chatReducer(before, token('a', 'x'));

  expect(before).toEqual(snapshot);
});

it('records the conversation id from done and keeps it across later questions', () => {
  const state = run(
    submit('a'),
    {
      type: 'done',
      id: 'a',
      answerSource: 'kb',
      confidence: 'high',
      conversationId: 'conv-1',
    },
    submit('b'),
  );

  expect(state.conversationId).toBe('conv-1');
  expect(state.messages.map(message => message.id)).toEqual(['a', 'b']);
});

it('keeps no conversation id after a failed first answer', () => {
  const state = run(submit('a'), {
    type: 'fail',
    id: 'a',
    error: { kind: 'unavailable' },
  });

  expect(state.conversationId).toBeUndefined();
});

it('loads saved turns as finished messages and makes the conversation current', () => {
  const state = run(submit('a'), {
    type: 'load',
    conversationId: 'conv-2',
    turns: [
      {
        id: 't1',
        question: 'q1',
        answer: 'a1',
        answerSource: 'web',
        sourceConfidence: 'medium',
        sources: [
          {
            n: 1,
            kind: 'web',
            title: 'Docs',
            url: 'https://example.com',
          },
        ],
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  });

  expect(state.conversationId).toBe('conv-2');
  expect(state.messages).toEqual([
    {
      id: 't1',
      question: 'q1',
      status: 'done',
      text: 'a1',
      sources: [
        {
          n: 1,
          kind: 'web',
          title: 'Docs',
          url: 'https://example.com',
        },
      ],
      answerSource: 'web',
      confidence: 'medium',
    },
  ]);
  expect(isChatBusy(state)).toBe(false);
});

it('forgets the conversation on new chat even when the screen is empty', () => {
  const state = run({ type: 'load', conversationId: 'conv-3', turns: [] }, { type: 'newChat' });

  expect(state).toBe(initialChatState);
});
