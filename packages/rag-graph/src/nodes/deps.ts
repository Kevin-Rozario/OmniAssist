import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import type { RagPolicy } from '../policy';
import type { Classifier, Generator, GraphEvent, KbRetriever, WebSearch } from '../ports';

/** Structured, text-free log lines. Callers must never pass question, passage or answer text. */
export interface RagLogger {
  warn: (fields: Record<string, unknown>, message: string) => void;
}

export const noopLogger: RagLogger = {
  warn: () => {},
};

export interface RagDeps {
  classifier: Classifier;
  retriever: KbRetriever;
  webSearch: WebSearch;
  generator: Generator;
  policy: Readonly<RagPolicy>;
  logger: RagLogger;
}

/** Writes an event to the graph's custom stream channel. A no-op when nobody is streaming. */
export function emit(config: LangGraphRunnableConfig, event: GraphEvent): void {
  config.writer?.(event);
}

/** Stops the node before it starts provider work for a request that was cancelled. */
export function ensureActive(config: LangGraphRunnableConfig): void {
  config.signal?.throwIfAborted();
}

/**
 * Records a provider failure and lets the node continue in a degraded state.
 * Cancellation is not a degradation: if the request was aborted the error is rethrown,
 * so an abort never turns into a fallback answer.
 */
export function degrade(
  deps: Pick<RagDeps, 'logger'>,
  config: LangGraphRunnableConfig,
  stage: string,
  error: unknown,
): void {
  if (config.signal?.aborted)
    throw config.signal.reason ?? error;

  deps.logger.warn({
    stage,
    errorClass: errorClass(error),
  }, 'provider call failed; continuing degraded');
}

function errorClass(error: unknown): string {
  return error instanceof Error
    ? error.name
    : typeof error;
}
