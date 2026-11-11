import type { AnswerSource, AskStage, SourceConfidence } from '@omni/types';
import type { ChatError, ChatErrorKind } from './chat-state';
import { ApiError, AskStreamError } from './api-client';

export const STAGE_LABELS = {
  routing: 'Understanding your question',
  searching_kb: 'Searching the knowledge base',
  grading: 'Checking what I found',
  searching_web: 'Searching the web',
  writing: 'Writing the answer',
} as const satisfies Record<AskStage, string>;

export function stageLabel(stage: AskStage): string {
  return STAGE_LABELS[stage];
}

export const ERROR_MESSAGES = {
  invalid_question: 'That question couldn\'t be sent. Make sure it isn\'t empty or too long, then try again.',
  session_expired: 'Your session has expired. Reload the page or sign in again.',
  conversation_full: 'This conversation has reached its limit. Start a new chat to keep asking.',
  conversation_missing: 'This conversation is no longer available. Start a new chat to continue.',
  unavailable: 'Something went wrong on our side. Please try again.',
  stream_failed: 'The connection was interrupted before the answer finished.',
  answer_failed: 'We couldn\'t finish this answer. Please try again.',
} as const satisfies Record<ChatErrorKind, string>;

export function errorMessage(error: ChatError): string {
  return ERROR_MESSAGES[error.kind];
}

/** True for the error `fetch` and streams raise when the request was aborted on purpose. */
export function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/**
 * Turn anything thrown while asking into a `ChatError`. Only the request id of an API
 * problem is kept; its title and detail are never shown. Aborts are not failures, so
 * callers must check `isAbort` themselves and not pass them here.
 */
export function toChatError(error: unknown): ChatError {
  if (error instanceof ApiError) {
    const { status, requestId } = error.problem;
    if (status === 400 || status === 413 || status === 422)
      return { kind: 'invalid_question', requestId };
    if (status === 409)
      return { kind: 'conversation_full', requestId };
    if (status === 404)
      return { kind: 'conversation_missing', requestId };
    if (status === 401 || status === 403)
      return { kind: 'session_expired', requestId };
    return { kind: 'unavailable', requestId };
  }
  if (error instanceof AskStreamError)
    return { kind: 'stream_failed' };
  return { kind: 'unavailable' };
}

export type HistoryAction = 'load' | 'open' | 'rename' | 'delete';

/** Plain-language failure text for the History sheet. Never shows server or provider text. */
export function historyErrorMessage(error: unknown, action: HistoryAction): string {
  if (error instanceof ApiError && error.problem.status === 404)
    return 'That conversation no longer exists.';
  if (error instanceof ApiError && (error.problem.status === 401 || error.problem.status === 403))
    return 'Your session has expired. Reload the page or sign in again.';
  switch (action) {
    case 'load':
      return 'We couldn\'t load your conversations.';
    case 'open':
      return 'We couldn\'t open that conversation. Please try again.';
    case 'rename':
      return 'We couldn\'t rename that conversation. Please try again.';
    case 'delete':
      return 'We couldn\'t delete that conversation. Please try again.';
  }
}

/** True when asking again in the same conversation cannot work, so a new chat is the next step. */
export function needsNewChat(error: ChatError): boolean {
  return error.kind === 'conversation_full' || error.kind === 'conversation_missing';
}

/** The URL if it is safe to open from a link (http or https), otherwise undefined. */
export function safeHttpUrl(url: string): string | undefined {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:'
      ? url
      : undefined;
  }
  catch {
    return undefined;
  }
}

export interface AnswerOrigin {
  /** Where the answer came from. */
  label: string;
  /** Confidence wording, absent when confidence does not apply. */
  confidence: string | null;
  /** Warning shown with the answer, absent when none is needed. */
  notice: string | null;
}

const SOURCE_LABELS = {
  kb: 'From company documents',
  web: 'From the web',
  fallback: 'General guidance',
  direct: 'Direct answer',
} as const satisfies Record<AnswerSource, string>;

const CONFIDENCE_LABELS = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
  not_applicable: null,
} as const satisfies Record<SourceConfidence, string | null>;

export const FALLBACK_NOTICE = 'This answer is not backed by company documents. Check it with the IT team before relying on it.';

export function answerOrigin(source: AnswerSource, confidence: SourceConfidence): AnswerOrigin {
  return {
    label: SOURCE_LABELS[source],
    // A direct answer has nothing to be confident about, whatever the API sent.
    confidence: source === 'direct'
      ? null
      : CONFIDENCE_LABELS[confidence],
    notice: source === 'fallback'
      ? FALLBACK_NOTICE
      : null,
  };
}
