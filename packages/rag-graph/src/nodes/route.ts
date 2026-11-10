import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import type { RouteDecision } from '../ports';
import type { RagStateType, RagStateUpdate } from '../state';
import type { RagDeps } from './deps';
import { decideRoute } from './decisions';
import { degrade, emit, ensureActive } from './deps';

export function createRouteNode(deps: RagDeps) {
  return async (state: RagStateType, config: LangGraphRunnableConfig): Promise<RagStateUpdate> => {
    ensureActive(config);
    emit(config, { type: 'status', stage: 'routing' });

    let decision: RouteDecision | undefined;
    try {
      decision = await deps.classifier.route(state.question, { signal: config.signal });
    }
    catch (error) {
      degrade(deps, config, 'route', error);
    }

    return {
      route: decideRoute(decision, deps.policy.routerMinConfidence),
    };
  };
}
