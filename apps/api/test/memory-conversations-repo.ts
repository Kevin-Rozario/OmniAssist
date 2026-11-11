import type {
  ConversationRow,
  ConversationsRepo,
  ConversationTurnRow,
  ConversationWithTurns,
  NewTurn,
} from '../src/modules/conversations/repo';
import { CONVERSATION_LIST_MAX } from '@omni/types';

/** In-memory repo for tests; enforces the same ownership, order and position rules as Postgres. */
export function memoryConversationsRepo(now: () => Date = () => new Date()): ConversationsRepo {
  const conversations = new Map<string, ConversationRow>();
  const turns = new Map<string, ConversationTurnRow[]>();

  function turnRow(conversationId: string, position: number, turn: NewTurn): ConversationTurnRow {
    return {
      ...turn,
      conversationId,
      position,
      createdAt: now(),
    };
  }

  function ownedRow(userId: string, id: string): ConversationRow | null {
    const row = conversations.get(id);
    return row && row.userId === userId
      ? row
      : null;
  }

  return {
    async create(userId, input) {
      const at = now();
      const row: ConversationRow = {
        id: input.id,
        userId,
        title: input.title,
        createdAt: at,
        updatedAt: at,
      };
      const first = turnRow(input.id, 1, input.turn);
      conversations.set(input.id, row);
      turns.set(input.id, [first]);
      return {
        ...row,
        turns: [first],
      };
    },

    async list(userId) {
      return [
        ...conversations.values(),
      ]
        .filter(row => row.userId === userId)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .slice(0, CONVERSATION_LIST_MAX)
        .map(row => ({ ...row }));
    },

    async get(userId, id): Promise<ConversationWithTurns | null> {
      const row = ownedRow(userId, id);
      return row
        ? {
            ...row,
            turns: [
              ...(turns.get(id) ?? []),
            ],
          }
        : null;
    },

    async turnCount(userId, id) {
      return ownedRow(userId, id)
        ? (turns.get(id)?.length ?? 0)
        : null;
    },

    async recentTurns(userId, id, limit) {
      return ownedRow(userId, id)
        ? (turns.get(id) ?? []).slice(-limit)
        : null;
    },

    async appendTurn(userId, id, turn, maxTurns) {
      const row = ownedRow(userId, id);
      if (!row)
        return { status: 'not_found' };
      const list = turns.get(id) ?? [];
      const position = (list.at(-1)?.position ?? 0) + 1;
      if (position > maxTurns)
        return { status: 'full' };
      const saved = turnRow(id, position, turn);
      turns.set(id, [...list, saved]);
      conversations.set(id, {
        ...row,
        updatedAt: now(),
      });
      return { status: 'saved', turn: saved };
    },

    async rename(userId, id, title) {
      const row = ownedRow(userId, id);
      if (!row)
        return null;
      const updated = { ...row, title };
      conversations.set(id, updated);
      return { ...updated };
    },

    async delete(userId, id) {
      if (!ownedRow(userId, id))
        return false;
      conversations.delete(id);
      turns.delete(id);
      return true;
    },
  };
}
