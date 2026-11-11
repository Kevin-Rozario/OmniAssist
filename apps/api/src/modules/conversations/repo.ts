import type { Database } from '@omni/db';
import type { AnswerSource, Citation, SourceConfidence } from '@omni/types';
import { and, asc, desc, eq, sql } from '@omni/db';
import { conversations, conversationTurns } from '@omni/db/schema';
import { CONVERSATION_LIST_MAX } from '@omni/types';

export interface ConversationRow {
  id: string;
  userId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationTurnRow {
  id: string;
  conversationId: string;
  position: number;
  question: string;
  answer: string;
  answerSource: AnswerSource;
  sourceConfidence: SourceConfidence;
  sources: Citation[];
  createdAt: Date;
}

export interface NewTurn {
  id: string;
  question: string;
  answer: string;
  answerSource: AnswerSource;
  sourceConfidence: SourceConfidence;
  sources: Citation[];
}

export interface ConversationWithTurns extends ConversationRow {
  turns: ConversationTurnRow[];
}

export type AppendTurnResult
  = | { status: 'saved'; turn: ConversationTurnRow }
    | { status: 'not_found' }
    | { status: 'full' };

/** Every method is scoped by `userId`: a foreign id behaves exactly like a missing one. */
export interface ConversationsRepo {
  /** Creates the conversation and its first turn in one transaction. */
  create: (userId: string, input: { id: string; title: string; turn: NewTurn }) => Promise<ConversationWithTurns>;
  /** Newest activity first, at most `CONVERSATION_LIST_MAX`. */
  list: (userId: string) => Promise<ConversationRow[]>;
  get: (userId: string, id: string) => Promise<ConversationWithTurns | null>;
  /** Number of saved turns, or null when the conversation is not the user's. */
  turnCount: (userId: string, id: string) => Promise<number | null>;
  /** The most recent `limit` turns, oldest first, or null when the conversation is not the user's. */
  recentTurns: (userId: string, id: string, limit: number) => Promise<ConversationTurnRow[] | null>;
  /** Appends the next turn and bumps `updatedAt`; refuses beyond `maxTurns`. */
  appendTurn: (userId: string, id: string, turn: NewTurn, maxTurns: number) => Promise<AppendTurnResult>;
  rename: (userId: string, id: string, title: string) => Promise<ConversationRow | null>;
  /** True when a row was removed. */
  delete: (userId: string, id: string) => Promise<boolean>;
}

function mapConversation(row: typeof conversations.$inferSelect): ConversationRow {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapTurn(row: typeof conversationTurns.$inferSelect): ConversationTurnRow {
  return {
    id: row.id,
    conversationId: row.conversationId,
    position: row.position,
    question: row.question,
    answer: row.answer,
    answerSource: row.answerSource,
    sourceConfidence: row.sourceConfidence,
    sources: row.sources as Citation[],
    createdAt: row.createdAt,
  };
}

function owned(userId: string, id: string) {
  return and(eq(conversations.id, id), eq(conversations.userId, userId));
}

function turnValues(conversationId: string, position: number, turn: NewTurn) {
  return {
    id: turn.id,
    conversationId,
    position,
    question: turn.question,
    answer: turn.answer,
    answerSource: turn.answerSource,
    sourceConfidence: turn.sourceConfidence,
    sources: turn.sources,
  };
}

export function drizzleConversationsRepo(db: Database): ConversationsRepo {
  return {
    async create(userId, input) {
      return db.transaction(async (tx) => {
        const now = new Date();
        const [row] = await tx.insert(conversations).values({
          id: input.id,
          userId,
          title: input.title,
          createdAt: now,
          updatedAt: now,
        }).returning();
        const [turn] = await tx.insert(conversationTurns)
          .values(turnValues(input.id, 1, input.turn))
          .returning();
        if (!row || !turn)
          throw new Error('Insert into conversations returned no row');
        return {
          ...mapConversation(row),
          turns: [
            mapTurn(turn),
          ],
        };
      });
    },

    async list(userId) {
      const rows = await db.select().from(conversations).where(eq(conversations.userId, userId)).orderBy(desc(conversations.updatedAt)).limit(CONVERSATION_LIST_MAX);
      return rows.map(mapConversation);
    },

    async get(userId, id) {
      const [row] = await db.select().from(conversations).where(owned(userId, id)).limit(1);
      if (!row)
        return null;
      const turns = await db.select().from(conversationTurns).where(eq(conversationTurns.conversationId, id)).orderBy(asc(conversationTurns.position));
      return {
        ...mapConversation(row),
        turns: turns.map(mapTurn),
      };
    },

    async turnCount(userId, id) {
      const [row] = await db.select({ id: conversations.id }).from(conversations).where(owned(userId, id)).limit(1);
      if (!row)
        return null;
      const [count] = await db.select({ n: sql<number>`count(*)::int` })
        .from(conversationTurns)
        .where(eq(conversationTurns.conversationId, id));
      return count?.n ?? 0;
    },

    async recentTurns(userId, id, limit) {
      const [row] = await db.select({ id: conversations.id }).from(conversations).where(owned(userId, id)).limit(1);
      if (!row)
        return null;
      const rows = await db.select().from(conversationTurns).where(eq(conversationTurns.conversationId, id)).orderBy(desc(conversationTurns.position)).limit(limit);
      return rows.reverse().map(mapTurn);
    },

    async appendTurn(userId, id, turn, maxTurns) {
      return db.transaction(async (tx) => {
        // Lock the owned row so concurrent appends serialise; the unique key is the backstop.
        const [row] = await tx.select({ id: conversations.id }).from(conversations).where(owned(userId, id)).for('update');
        if (!row)
          return { status: 'not_found' } as const;
        const [last] = await tx.select({ position: conversationTurns.position })
          .from(conversationTurns)
          .where(eq(conversationTurns.conversationId, id))
          .orderBy(desc(conversationTurns.position))
          .limit(1);
        const position = (last?.position ?? 0) + 1;
        if (position > maxTurns)
          return { status: 'full' } as const;
        const [saved] = await tx.insert(conversationTurns)
          .values(turnValues(id, position, turn))
          .returning();
        if (!saved)
          throw new Error('Insert into conversation_turns returned no row');
        await tx.update(conversations)
          .set({
            updatedAt: new Date(),
          })
          .where(owned(userId, id));
        return {
          status: 'saved',
          turn: mapTurn(saved),
        } as const;
      });
    },

    async rename(userId, id, title) {
      const [row] = await db.update(conversations)
        .set({ title })
        .where(owned(userId, id))
        .returning();
      return row
        ? mapConversation(row)
        : null;
    },

    async delete(userId, id) {
      const rows = await db.delete(conversations).where(owned(userId, id)).returning({ id: conversations.id });
      return rows.length > 0;
    },
  };
}
