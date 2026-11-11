import type { AnswerSource } from '@omni/types';
import type { HistoryExchange, KbPassage, RouteLabel, WebResult } from './ports';
import { Annotation } from '@langchain/langgraph';

export type Verdict = 'good' | 'weak';

/** A passage that passed grading. Only these reach answer generation and citations. */
export type AcceptedSource
  = | { kind: 'kb'; passage: KbPassage }
    | { kind: 'web'; result: WebResult };

function lastValue<T>(initial: () => T) {
  return Annotation<T>({
    reducer: (_previous, next) => next,
    default: initial,
  });
}

export const RagState = Annotation.Root({
  /** The question the flow works on: standalone once rewritten, as asked otherwise. */
  question: lastValue<string>(() => ''),
  /** The user's own wording, kept for the answer prompt. Set by `rewrite_question`. */
  originalQuestion: lastValue<string>(() => ''),
  /** Earlier exchanges of the conversation, oldest first. Empty for a new conversation. */
  history: lastValue<HistoryExchange[]>(() => []),
  route: lastValue<RouteLabel>(() => 'kb'),
  kbChunks: lastValue<KbPassage[]>(() => []),
  kbVerdict: lastValue<Verdict>(() => 'weak'),
  webResults: lastValue<WebResult[]>(() => []),
  webVerdict: lastValue<Verdict>(() => 'weak'),
  acceptedSources: lastValue<AcceptedSource[]>(() => []),
  answerSource: lastValue<AnswerSource | undefined>(() => undefined),
});

export type RagStateType = typeof RagState.State;
export type RagStateUpdate = typeof RagState.Update;
