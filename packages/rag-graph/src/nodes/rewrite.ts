import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import type { HistoryExchange } from '../ports';
import type { RagStateType, RagStateUpdate } from '../state';
import type { RagDeps } from './deps';
import { buildRewritePrompt } from '../prompts';
import { degrade, ensureActive } from './deps';

/** The model sometimes wraps its answer in quotes or a label; keep just the question. */
function cleanRewrite(text: string): string {
  return text
    .trim()
    .replace(/^(?:standalone question|question)\s*:\s*/i, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function collect(
  deps: RagDeps,
  question: string,
  history: readonly HistoryExchange[],
  signal: AbortSignal,
): Promise<string> {
  let text = '';
  for await (const delta of deps.generator.stream({
    ...buildRewritePrompt(question, history),
    signal,
  }))
    text += delta;
  return text;
}

/**
 * Turns a follow-up like "and on a Mac?" into a standalone question before routing and retrieval.
 * With no history it passes through without a model call. Any failure, timeout or unusable output
 * falls back to the question as asked, so the answer always proceeds. Logs never carry text.
 */
export function createRewriteQuestionNode(deps: RagDeps) {
  return async (state: RagStateType, config: LangGraphRunnableConfig): Promise<RagStateUpdate> => {
    ensureActive(config);
    const original = state.question;
    const passThrough: RagStateUpdate = { originalQuestion: original, question: original };

    if (state.history.length === 0)
      return passThrough;

    const timeout = AbortSignal.timeout(deps.policy.rewriteTimeoutMs);
    const signal = config.signal
      ? AbortSignal.any([config.signal, timeout])
      : timeout;
    const startedAt = performance.now();

    try {
      const rewritten = cleanRewrite(await collect(deps, original, state.history, signal));
      if (rewritten.length === 0 || rewritten.length > deps.policy.rewriteMaxLength)
        throw new Error('Unusable rewrite');
      deps.logger.info({
        stage: 'rewrite_question',
        changed: rewritten !== original,
        ms: Math.round(performance.now() - startedAt),
      }, 'follow-up question rewritten');
      return { originalQuestion: original, question: rewritten };
    }
    catch (error) {
      degrade(deps, config, 'rewrite_question', error);
      return passThrough;
    }
  };
}
