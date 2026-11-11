import type {
  ConversationDetail,
  ConversationListResponse,
  ConversationSummary,
} from '@omni/types';
import type { ConversationRow, ConversationsRepo, ConversationWithTurns } from './repo';
import { NotFoundError } from '../../lib/errors';

export interface ConversationsService {
  list: (userId: string) => Promise<ConversationListResponse>;
  get: (userId: string, id: string) => Promise<ConversationDetail>;
  rename: (userId: string, id: string, title: string) => Promise<ConversationSummary>;
  delete: (userId: string, id: string) => Promise<void>;
}

function toSummary(row: ConversationRow): ConversationSummary {
  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDetail(row: ConversationWithTurns): ConversationDetail {
  return {
    ...toSummary(row),
    turns: row.turns.map(turn => ({
      id: turn.id,
      question: turn.question,
      answer: turn.answer,
      answerSource: turn.answerSource,
      sourceConfidence: turn.sourceConfidence,
      sources: turn.sources,
      createdAt: turn.createdAt.toISOString(),
    })),
  };
}

/** The same message for missing and foreign ids, so existence never leaks. */
function missing(id: string): NotFoundError {
  return new NotFoundError(`Conversation ${id} does not exist.`);
}

export function createConversationsService(repo: ConversationsRepo): ConversationsService {
  return {
    async list(userId) {
      return {
        conversations: (await repo.list(userId)).map(toSummary),
      };
    },
    async get(userId, id) {
      const row = await repo.get(userId, id);
      if (!row)
        throw missing(id);
      return toDetail(row);
    },
    async rename(userId, id, title) {
      const row = await repo.rename(userId, id, title);
      if (!row)
        throw missing(id);
      return toSummary(row);
    },
    async delete(userId, id) {
      if (!(await repo.delete(userId, id)))
        throw missing(id);
    },
  };
}
