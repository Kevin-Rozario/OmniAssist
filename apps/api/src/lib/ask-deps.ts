import type { VectorStore } from '@omni/rag-core';
import type { KbRetriever, RagGraph, RagLogger } from '@omni/rag-graph';
import type { Env } from '../env';
import {
  createRagGraph,
  createSdkJevClassifier,
  createSdkOpenAiGenerator,
  createSdkTavilyWebSearch,
  policy,
} from '@omni/rag-graph';

export interface AskDeps {
  graph: RagGraph;
  /** Whole-request deadline, enforced by the ask service. */
  timeoutMs: number;
}

export interface CreateAskDepsOptions {
  /** The same store the documents module writes to, so answers read what was ingested. */
  vectorStore: VectorStore;
  logger: RagLogger & { info: (fields: Record<string, unknown>, message: string) => void };
}

/** Shared ask runtime wiring: the provider adapters and the compiled graph. */
export function createAskDeps(env: Env, options: CreateAskDepsOptions): AskDeps {
  const { vectorStore, logger } = options;

  // A KbPassage has the same shape as a search hit, so the store is the retriever.
  const retriever: KbRetriever = {
    retrieve: (query, { topK, signal }) => vectorStore.search({ query, topK, signal }),
  };

  return {
    graph: createRagGraph({
      classifier: createSdkJevClassifier({
        apiKey: env.TYPESAFE_API_KEY,
        model: env.TYPESAFE_MODEL,
        logger,
      }),
      retriever,
      webSearch: createSdkTavilyWebSearch({ apiKey: env.TAVILY_API_KEY }),
      generator: createSdkOpenAiGenerator({
        apiKey: env.OPENAI_API_KEY,
        model: env.OPENAI_ANSWER_MODEL,
      }),
      policy: { ...policy, kbTopK: env.KB_RETRIEVAL_TOP_K },
      logger,
    }),
    timeoutMs: env.ASK_TIMEOUT_MS,
  };
}
