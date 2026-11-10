import type { AnswerSource } from '@omni/types';
import type { KbPassage, RouteLabel, WebResult } from './ports';
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
  question: lastValue<string>(() => ''),
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
