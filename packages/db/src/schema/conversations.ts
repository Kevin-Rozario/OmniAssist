import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

export const conversationAnswerSourceEnum = pgEnum('conversation_answer_source', [
  'kb',
  'web',
  'fallback',
  'direct',
]);

export const conversationSourceConfidenceEnum = pgEnum('conversation_source_confidence', [
  'high',
  'medium',
  'low',
  'not_applicable',
]);

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey(),
    userId: text('user_id').notNull(),
    title: text('title').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('conversations_user_updated_idx').on(table.userId, sql`${table.updatedAt} desc`),
  ],
);

export const conversationTurns = pgTable(
  'conversation_turns',
  {
    id: uuid('id').primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    question: text('question').notNull(),
    answer: text('answer').notNull(),
    answerSource: conversationAnswerSourceEnum('answer_source').notNull(),
    sourceConfidence: conversationSourceConfidenceEnum('source_confidence').notNull(),
    sources: jsonb('sources').notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    unique('conversation_turns_conversation_position_unique').on(table.conversationId, table.position),
  ],
);
