import type { AskEvent, GraphEvent, RagStateType } from '@omni/rag-graph';
import type { AskDeps } from '../../lib/ask-deps';
import { sourceConfidenceFor } from '@omni/types';

export interface AskOptions {
  /** Client disconnect. Combined with the service deadline. */
  signal?: AbortSignal;
}

export interface AskService {
  /** Yields the ordered events of one question, ending with `done`. Failures are thrown. */
  ask: (question: string, options?: AskOptions) => AsyncIterable<AskEvent>;
}

export function createAskService(deps: AskDeps): AskService {
  return {
    async* ask(question, options = {}) {
      const signal = options.signal
        ? AbortSignal.any([
            options.signal,
            AbortSignal.timeout(deps.timeoutMs),
          ])
        : AbortSignal.timeout(deps.timeoutMs);

      let finalState: RagStateType | undefined;
      const stream = await deps.graph.stream({ question }, {
        streamMode: ['custom', 'values'],
        signal,
      });

      for await (const [mode, chunk] of stream) {
        if (mode === 'custom')
          yield chunk as GraphEvent;
        else
          finalState = chunk as RagStateType;
      }

      const answerSource = finalState?.answerSource;
      if (!answerSource)
        throw new Error('ask graph finished without an answer source');

      yield {
        type: 'done',
        answerSource,
        sourceConfidence: sourceConfidenceFor(answerSource),
      };
    },
  };
}
