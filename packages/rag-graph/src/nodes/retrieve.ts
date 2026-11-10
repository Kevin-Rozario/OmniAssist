import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import type { KbPassage } from '../ports';
import type { RagStateType, RagStateUpdate } from '../state';
import type { RagDeps } from './deps';
import { degrade, emit, ensureActive } from './deps';

export function createRetrieveKbNode(deps: RagDeps) {
  return async (state: RagStateType, config: LangGraphRunnableConfig): Promise<RagStateUpdate> => {
    ensureActive(config);
    emit(config, { type: 'status', stage: 'searching_kb' });

    let kbChunks: KbPassage[] = [];
    try {
      kbChunks = await deps.retriever.retrieve(state.question, {
        topK: deps.policy.kbTopK,
        signal: config.signal,
      });
    }
    catch (error) {
      degrade(deps, config, 'retrieve_kb', error);
    }

    return { kbChunks };
  };
}
