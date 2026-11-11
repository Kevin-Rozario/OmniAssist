import type { AskEvent, GraphEvent, RagStateType } from '@omni/rag-graph';
import type { AskStage } from '@omni/types';
import type { AskDeps } from '../../lib/ask-deps';
import type { Logger } from '../../lib/logger';
import { performance } from 'node:perf_hooks';
import { sourceConfidenceFor } from '@omni/types';
import { problemType } from '../../lib/errors';

export interface AskOptions {
  /** Client disconnect. Combined with the service deadline. */
  signal?: AbortSignal;
  /** Request-scoped logger. Receives stage names, timings, verdicts and error classes, never text. */
  logger: Logger;
  /** Echoed in the `error` event so a user can quote it when reporting a failure. */
  requestId: string;
}

export interface AskService {
  /**
   * Yields the ordered events of one question. The stream ends after `done` or `error`.
   * A cancelled request ends silently: nobody is listening, so no event is produced.
   */
  ask: (question: string, options: AskOptions) => AsyncIterable<AskEvent>;
}

type FailureCause = 'timeout' | 'upstream';

const failureEvents: Record<FailureCause, { type: string; title: string }> = {
  timeout: { type: problemType.serviceUnavailable, title: 'The answer took too long' },
  upstream: { type: problemType.upstream, title: 'Upstream service failed' },
};

function errorClass(error: unknown): string {
  return error instanceof Error
    ? error.name
    : typeof error;
}

export function createAskService(deps: AskDeps): AskService {
  return {
    async* ask(question, { signal: clientSignal, logger, requestId }) {
      const startedAt = performance.now();
      const deadline = AbortSignal.timeout(deps.timeoutMs);
      const signal = clientSignal
        ? AbortSignal.any([clientSignal, deadline])
        : deadline;

      const stageMs: Partial<Record<AskStage, number>> = {};
      let stage: AskStage | undefined;
      let stageStartedAt = startedAt;
      let tokens = 0;
      let state: RagStateType | undefined;

      function closeStage(): void {
        if (!stage)
          return;
        const now = performance.now();
        stageMs[stage] = Math.round((stageMs[stage] ?? 0) + now - stageStartedAt);
        stageStartedAt = now;
      }

      try {
        const stream = await deps.graph.stream({ question }, {
          streamMode: ['custom', 'values'],
          signal,
        });

        for await (const [mode, chunk] of stream) {
          if (mode === 'values') {
            state = chunk as RagStateType;
            continue;
          }

          const event = chunk as GraphEvent;
          if (event.type === 'status') {
            closeStage();
            stage = event.stage;
          }
          else if (event.type === 'token') {
            tokens += 1;
          }
          yield event;
        }

        const answerSource = state?.answerSource;
        if (!answerSource)
          throw new Error('ask graph finished without an answer source');

        closeStage();
        logger.info({
          route: state?.route,
          stageMs,
          kbVerdict: state?.kbVerdict,
          webVerdict: state?.webVerdict,
          answerSource,
          tokens,
          totalMs: Math.round(performance.now() - startedAt),
        }, 'ask completed');

        yield {
          type: 'done',
          answerSource,
          sourceConfidence: sourceConfidenceFor(answerSource),
        };
      }
      catch (error) {
        closeStage();
        const totalMs = Math.round(performance.now() - startedAt);

        if (clientSignal?.aborted) {
          logger.info({ stage, stageMs, totalMs }, 'ask cancelled by client');
          return;
        }

        const cause: FailureCause = deadline.aborted
          ? 'timeout'
          : 'upstream';
        logger.error({
          cause,
          stage,
          stageMs,
          errorClass: errorClass(error),
          totalMs,
        }, 'ask failed');

        yield {
          type: 'error',
          error: { ...failureEvents[cause], requestId },
        };
      }
    },
  };
}
