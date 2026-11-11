import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import type { AnswerSource } from '@omni/types';
import type { HistoryExchange } from '../ports';
import type { Prompt } from '../prompts';
import type { AcceptedSource, RagStateType, RagStateUpdate } from '../state';
import type { RagDeps } from './deps';
import {
  buildDirectPrompt,
  buildFallbackPrompt,
  buildKbAnswerPrompt,
  buildWebAnswerPrompt,
} from '../prompts';
import { buildCitations, toPromptSources } from './citations';
import { emit, ensureActive } from './deps';

/**
 * Streams the generator's text as `token` events.
 * Generation failures are not degraded: they propagate so the question ends with an error
 * rather than a partial or invented answer passing as complete.
 */
async function streamAnswer(
  deps: RagDeps,
  config: LangGraphRunnableConfig,
  prompt: Prompt,
): Promise<void> {
  let produced = false;

  for await (const text of deps.generator.stream({ ...prompt, signal: config.signal })) {
    ensureActive(config);
    if (text.length === 0)
      continue;
    produced = true;
    emit(config, { type: 'token', text });
  }

  ensureActive(config);
  if (!produced)
    throw new Error('Answer generator produced no text');
}

/** The answer addresses the user's own wording; routing and retrieval used the standalone form. */
function askedQuestion(state: RagStateType): string {
  return state.originalQuestion || state.question;
}

function sourcesOfKind(state: RagStateType, kind: AcceptedSource['kind']): AcceptedSource[] {
  return state.acceptedSources.filter(source => source.kind === kind);
}

function createCitedAnswerNode(
  deps: RagDeps,
  kind: 'kb' | 'web',
  buildPrompt: (
    question: string,
    sources: ReturnType<typeof toPromptSources>,
    history: readonly HistoryExchange[],
  ) => Prompt,
) {
  return async (state: RagStateType, config: LangGraphRunnableConfig): Promise<RagStateUpdate> => {
    ensureActive(config);

    const accepted = sourcesOfKind(state, kind);
    emit(config, { type: 'status', stage: 'writing' });
    emit(config, {
      type: 'citations',
      sources: buildCitations(accepted),
    });
    await streamAnswer(deps, config, buildPrompt(askedQuestion(state), toPromptSources(accepted), state.history));

    return { answerSource: kind };
  };
}

function createUncitedAnswerNode(
  deps: RagDeps,
  answerSource: Extract<AnswerSource, 'fallback' | 'direct'>,
  buildPrompt: (question: string, history: readonly HistoryExchange[]) => Prompt,
) {
  return async (state: RagStateType, config: LangGraphRunnableConfig): Promise<RagStateUpdate> => {
    ensureActive(config);

    emit(config, { type: 'status', stage: 'writing' });
    await streamAnswer(deps, config, buildPrompt(askedQuestion(state), state.history));

    return { answerSource };
  };
}

export function createAnswerKbNode(deps: RagDeps) {
  return createCitedAnswerNode(deps, 'kb', buildKbAnswerPrompt);
}

export function createAnswerWebNode(deps: RagDeps) {
  return createCitedAnswerNode(deps, 'web', buildWebAnswerPrompt);
}

export function createAnswerFallbackNode(deps: RagDeps) {
  return createUncitedAnswerNode(deps, 'fallback', buildFallbackPrompt);
}

export function createAnswerDirectNode(deps: RagDeps) {
  return createUncitedAnswerNode(deps, 'direct', buildDirectPrompt);
}
