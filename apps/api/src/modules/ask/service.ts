import type { AskEvent, GraphEvent, RagStateType } from '@omni/rag-graph';
import type { AskStage, Citation } from '@omni/types';
import type { AskDeps } from '../../lib/ask-deps';
import type { Logger } from '../../lib/logger';
import type { ConversationsRepo } from '../conversations/repo';
import { performance } from 'node:perf_hooks';
import { CONVERSATION_CONTEXT_TURNS, CONVERSATION_MAX_TURNS, CONVERSATION_TITLE_MAX_LENGTH, sourceConfidenceFor } from '@omni/types';
import { v7 as uuidv7 } from 'uuid';
import { ConflictError, NotFoundError, problemType } from '../../lib/errors';

/** Characters of each earlier question and answer given to the model, so the prompt stays bounded. */
export const HISTORY_QUESTION_CHARS = 500;
export const HISTORY_ANSWER_CHARS = 1500;

export interface AskConversation {
  /** The conversation to continue, or null to start a new one when the answer completes. */
  conversationId: string | null;
  /** The most recent exchanges, oldest first, already bounded. */
  history: Array<{ question: string; answer: string }>;
}

export interface AskOptions {
  /** The signed-in caller. Conversations are scoped to them. */
  userId: string;
  /** From `begin`. Omitted means a new conversation. */
  conversation?: AskConversation;
  /** Client disconnect. Combined with the service deadline. */
  signal?: AbortSignal;
  /** Request-scoped logger. Receives stage names, timings, verdicts and error classes, never text. */
  logger: Logger;
  /** Echoed in the `error` event so a user can quote it when reporting a failure. */
  requestId: string;
}

export interface AskService {
  /**
   * Resolves the conversation before anything streams. Throws `NotFoundError` for a missing or
   * foreign id and `ConflictError` for a full conversation, so no processing starts in those cases.
   */
  begin: (userId: string, conversationId: string | undefined) => Promise<AskConversation>;
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

export interface AskServiceDeps extends AskDeps {
  conversations: ConversationsRepo;
  createId?: () => string;
}

function bounded(text: string, max: number): string {
  return text.length > max
    ? `${text.slice(0, max)}…`
    : text;
}

/** The first question, flattened to one line and shortened with an ellipsis past the limit. */
export function titleFromQuestion(question: string): string {
  const flat = question.replace(/\s+/g, ' ').trim();
  return flat.length > CONVERSATION_TITLE_MAX_LENGTH
    ? `${flat.slice(0, CONVERSATION_TITLE_MAX_LENGTH - 1).trimEnd()}…`
    : flat;
}

export function createAskService(deps: AskServiceDeps): AskService {
  const { conversations, createId = uuidv7 } = deps;

  return {
    async begin(userId, conversationId) {
      if (!conversationId)
        return { conversationId: null, history: [] };

      const count = await conversations.turnCount(userId, conversationId);
      if (count === null)
        throw new NotFoundError(`Conversation ${conversationId} does not exist.`);
      if (count >= CONVERSATION_MAX_TURNS)
        throw new ConflictError('This conversation is full. Start a new conversation to keep asking.');

      const turns = await conversations.recentTurns(userId, conversationId, CONVERSATION_CONTEXT_TURNS);
      if (turns === null)
        throw new NotFoundError(`Conversation ${conversationId} does not exist.`);
      return {
        conversationId,
        history: turns.map(turn => ({
          question: bounded(turn.question, HISTORY_QUESTION_CHARS),
          answer: bounded(turn.answer, HISTORY_ANSWER_CHARS),
        })),
      };
    },

    async* ask(question, { userId, conversation, signal: clientSignal, logger, requestId }) {
      const startedAt = performance.now();
      const deadline = AbortSignal.timeout(deps.timeoutMs);
      const signal = clientSignal
        ? AbortSignal.any([clientSignal, deadline])
        : deadline;

      const stageMs: Partial<Record<AskStage, number>> = {};
      let stage: AskStage | undefined;
      let stageStartedAt = startedAt;
      let tokens = 0;
      let answer = '';
      let sources: Citation[] = [];
      let state: RagStateType | undefined;

      function closeStage(): void {
        if (!stage)
          return;
        const now = performance.now();
        stageMs[stage] = Math.round((stageMs[stage] ?? 0) + now - stageStartedAt);
        stageStartedAt = now;
      }

      try {
        const stream = await deps.graph.stream({ question, history: conversation?.history ?? [] }, {
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
            answer += event.text;
          }
          else if (event.type === 'citations') {
            sources = event.sources;
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

        // An abort or deadline that fires now must not save, so success always means saved.
        signal.throwIfAborted();
        const sourceConfidence = sourceConfidenceFor(answerSource);
        const turn = {
          id: createId(),
          question,
          answer,
          answerSource,
          sourceConfidence,
          sources,
        };
        let savedTo: string;
        if (conversation?.conversationId) {
          const result = await conversations.appendTurn(userId, conversation.conversationId, turn, CONVERSATION_MAX_TURNS);
          if (result.status !== 'saved')
            throw new Error(`conversation append refused: ${result.status}`);
          savedTo = conversation.conversationId;
        }
        else {
          savedTo = createId();
          await conversations.create(userId, {
            id: savedTo,
            title: titleFromQuestion(question),
            turn,
          });
        }
        logger.info({ conversationId: savedTo }, 'conversation saved');

        yield {
          type: 'done',
          answerSource,
          sourceConfidence,
          conversationId: savedTo,
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
