import { AskStageSchema } from '@omni/types';
import { expect, it } from 'vitest';
import { ApiError, AskStreamError } from './api-client';
import {
  answerOrigin,
  ERROR_MESSAGES,
  errorMessage,
  FALLBACK_NOTICE,
  historyErrorMessage,
  isAbort,
  needsNewChat,
  stageLabel,
  tightenListSpacing,
  toChatError,
} from './chat-copy';

function apiError(status: number, requestId = 'req-1'): ApiError {
  return new ApiError({
    type: 'about:blank',
    title: 'Provider exploded: secret detail',
    status,
    requestId,
  });
}

it('describes every stage in plain words', () => {
  for (const stage of AskStageSchema.options)
    expect(stageLabel(stage)).toMatch(/^[A-Z][\w ]+$/);
  expect(stageLabel('searching_kb')).toBe('Searching the knowledge base');
});

it.each([
  [400, 'invalid_question'],
  [401, 'session_expired'],
  [404, 'conversation_missing'],
  [409, 'conversation_full'],
  [500, 'unavailable'],
  [503, 'unavailable'],
] as const)('maps HTTP %i to %s and keeps only the request id', (status, kind) => {
  expect(toChatError(apiError(status, 'req-9'))).toEqual({ kind, requestId: 'req-9' });
});

it('maps a broken stream, and anything unexpected, without a request id', () => {
  expect(toChatError(new AskStreamError('x'))).toEqual({ kind: 'stream_failed' });
  expect(toChatError(new TypeError('Failed to fetch'))).toEqual({ kind: 'unavailable' });
  expect(toChatError('boom')).toEqual({ kind: 'unavailable' });
});

it('never shows server or provider text in a message', () => {
  const shown = errorMessage(toChatError(apiError(500)));

  expect(shown).not.toMatch(/provider|secret/i);
});

it('has a distinct message for every error kind', () => {
  const messages = Object.values(ERROR_MESSAGES);

  expect(new Set(messages).size).toBe(messages.length);
});

it('recognises an abort', () => {
  expect(isAbort(new DOMException('aborted', 'AbortError'))).toBe(true);
  expect(isAbort(new Error('nope'))).toBe(false);
  expect(isAbort(undefined)).toBe(false);
});

it('labels a knowledge base answer with high confidence and no notice', () => {
  expect(answerOrigin('kb', 'high')).toEqual({
    label: 'From company documents',
    confidence: 'High confidence',
    notice: null,
  });
});

it('labels a web answer with medium confidence', () => {
  expect(answerOrigin('web', 'medium')).toMatchObject({ label: 'From the web', confidence: 'Medium confidence' });
});

it('warns that a fallback answer is not backed by company documents', () => {
  expect(answerOrigin('fallback', 'low')).toEqual({
    label: 'General guidance',
    confidence: 'Low confidence',
    notice: FALLBACK_NOTICE,
  });
  expect(FALLBACK_NOTICE).toMatch(/not backed by company documents/);
});

it('shows no confidence for a direct answer', () => {
  expect(answerOrigin('direct', 'not_applicable').confidence).toBeNull();
  expect(answerOrigin('direct', 'high').confidence).toBeNull();
});

it('explains a full conversation in plain words and points to a new chat', () => {
  const shown = errorMessage(toChatError(apiError(409)));

  expect(shown).toMatch(/limit/i);
  expect(shown).toMatch(/new chat/i);
  expect(shown).not.toMatch(/409|conflict/i);
});

it('words History failures plainly and never shows server text', () => {
  expect(historyErrorMessage(apiError(404), 'open')).toBe('That conversation no longer exists.');
  expect(historyErrorMessage(apiError(401), 'load')).toMatch(/session has expired/);
  for (const action of ['load', 'open', 'rename', 'delete'] as const) {
    const shown = historyErrorMessage(apiError(500), action);
    expect(shown).not.toMatch(/provider|secret/i);
    expect(shown.length).toBeGreaterThan(10);
  }
  expect(historyErrorMessage(new TypeError('Failed to fetch'), 'rename')).toMatch(/rename/);
});

it('sends the user to a new chat only when the conversation cannot continue', () => {
  expect(needsNewChat({ kind: 'conversation_full' })).toBe(true);
  expect(needsNewChat({ kind: 'conversation_missing' })).toBe(true);
  expect(needsNewChat({ kind: 'unavailable' })).toBe(false);
});

it('tightens the gaps between list items but keeps paragraph breaks', () => {
  expect(tightenListSpacing('Steps:\n\n1. Open VPN\n\n2. Sign in\n\n- extra\n\nDone.'))
    .toBe('Steps:\n1. Open VPN\n2. Sign in\n- extra\n\nDone.');
  expect(tightenListSpacing('One.\n\nTwo.')).toBe('One.\n\nTwo.');
});
