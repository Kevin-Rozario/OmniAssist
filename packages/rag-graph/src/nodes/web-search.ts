import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import type { WebResult } from '../ports';
import type { RagStateType, RagStateUpdate } from '../state';
import type { RagDeps } from './deps';
import { degrade, emit, ensureActive } from './deps';

export function createSearchWebNode(deps: RagDeps) {
  return async (state: RagStateType, config: LangGraphRunnableConfig): Promise<RagStateUpdate> => {
    ensureActive(config);
    emit(config, { type: 'status', stage: 'searching_web' });

    let webResults: WebResult[] = [];
    try {
      webResults = await deps.webSearch.search(state.question, {
        maxResults: deps.policy.webMaxResults,
        signal: config.signal,
      });
    }
    catch (error) {
      degrade(deps, config, 'search_web', error);
    }

    return { webResults };
  };
}
