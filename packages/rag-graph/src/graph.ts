import type { RagDeps, RagLogger } from './nodes/deps';
import type { RagPolicy } from './policy';
import type { Classifier, Generator, KbRetriever, WebSearch } from './ports';
import type { RagStateType } from './state';
import { END, START, StateGraph } from '@langchain/langgraph';
import {
  createAnswerDirectNode,
  createAnswerFallbackNode,
  createAnswerKbNode,
  createAnswerWebNode,
} from './nodes/answer';
import { noopLogger } from './nodes/deps';
import { createGradeKbNode, createGradeWebNode } from './nodes/grade';
import { createRetrieveKbNode } from './nodes/retrieve';
import { createRouteNode } from './nodes/route';
import { createSearchWebNode } from './nodes/web-search';
import { policy as defaultPolicy } from './policy';
import { RagState } from './state';

export interface RagGraphOptions {
  classifier: Classifier;
  retriever: KbRetriever;
  webSearch: WebSearch;
  generator: Generator;
  /** Defaults to the shared `policy`. */
  policy?: Readonly<RagPolicy>;
  /** Receives text-free lines about degraded provider calls. Defaults to a no-op. */
  logger?: RagLogger;
}

/** Edge functions are plain functions over state, so each branch is testable without a model. */
export function afterRoute(state: RagStateType): 'answer_direct' | 'retrieve_kb' {
  return state.route === 'direct'
    ? 'answer_direct'
    : 'retrieve_kb';
}

export function afterGradeKb(state: RagStateType): 'answer_kb' | 'search_web' {
  return state.kbVerdict === 'good'
    ? 'answer_kb'
    : 'search_web';
}

export function afterGradeWeb(state: RagStateType): 'answer_web' | 'answer_fallback' {
  return state.webVerdict === 'good'
    ? 'answer_web'
    : 'answer_fallback';
}

/**
 * Builds the answer flow. The node is `router` because `route` is already a state field:
 *
 *     START -> router --kb--> retrieve_kb -> grade_kb --good--> answer_kb -> END
 *                |                             '--weak--> search_web -> grade_web
 *                |                                         --good--> answer_web -> END
 *                |                                         --weak--> answer_fallback -> END
 *                '--direct--> answer_direct -> END
 *
 * Run it with `graph.stream(input, { streamMode: 'custom', signal })` to receive `status`,
 * `citations` and `token` events as the nodes write them.
 */
export function createRagGraph(options: RagGraphOptions) {
  const deps: RagDeps = {
    classifier: options.classifier,
    retriever: options.retriever,
    webSearch: options.webSearch,
    generator: options.generator,
    policy: options.policy ?? defaultPolicy,
    logger: options.logger ?? noopLogger,
  };

  return new StateGraph(RagState)
    .addNode('router', createRouteNode(deps))
    .addNode('retrieve_kb', createRetrieveKbNode(deps))
    .addNode('grade_kb', createGradeKbNode(deps))
    .addNode('search_web', createSearchWebNode(deps))
    .addNode('grade_web', createGradeWebNode(deps))
    .addNode('answer_kb', createAnswerKbNode(deps))
    .addNode('answer_web', createAnswerWebNode(deps))
    .addNode('answer_fallback', createAnswerFallbackNode(deps))
    .addNode('answer_direct', createAnswerDirectNode(deps))
    .addEdge(START, 'router')
    .addConditionalEdges('router', afterRoute, ['retrieve_kb', 'answer_direct'])
    .addEdge('retrieve_kb', 'grade_kb')
    .addConditionalEdges('grade_kb', afterGradeKb, ['answer_kb', 'search_web'])
    .addEdge('search_web', 'grade_web')
    .addConditionalEdges('grade_web', afterGradeWeb, ['answer_web', 'answer_fallback'])
    .addEdge('answer_kb', END)
    .addEdge('answer_web', END)
    .addEdge('answer_fallback', END)
    .addEdge('answer_direct', END)
    .compile();
}

export type RagGraph = ReturnType<typeof createRagGraph>;
