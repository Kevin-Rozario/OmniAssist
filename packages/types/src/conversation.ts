import { z } from 'zod';
import { AnswerSourceSchema, CitationSchema, SourceConfidenceSchema } from './ask';

export const CONVERSATION_TITLE_MAX_LENGTH = 60;
/** Exchanges a single conversation can hold. */
export const CONVERSATION_MAX_TURNS = 100;
/** Conversations returned by the list endpoint. */
export const CONVERSATION_LIST_MAX = 100;
/** Most recent exchanges used as context for a follow-up question. */
export const CONVERSATION_CONTEXT_TURNS = 6;

export const ConversationTitleSchema = z.string().trim().min(1).max(CONVERSATION_TITLE_MAX_LENGTH);

export const ConversationSummarySchema = z.object({
  id: z.uuid(),
  title: ConversationTitleSchema,
  /** When the conversation last gained an exchange or was renamed. */
  updatedAt: z.iso.datetime(),
});
export type ConversationSummary = z.infer<typeof ConversationSummarySchema>;

export const ConversationListResponseSchema = z.object({
  conversations: z.array(ConversationSummarySchema).max(CONVERSATION_LIST_MAX),
});
export type ConversationListResponse = z.infer<typeof ConversationListResponseSchema>;

/** One saved question and its completed answer. */
export const ConversationTurnSchema = z.object({
  id: z.uuid(),
  question: z.string().min(1),
  answer: z.string().min(1),
  answerSource: AnswerSourceSchema,
  sourceConfidence: SourceConfidenceSchema,
  /** Citations exactly as first shown, with their original numbers. */
  sources: z.array(CitationSchema),
  createdAt: z.iso.datetime(),
});
export type ConversationTurn = z.infer<typeof ConversationTurnSchema>;

export const ConversationDetailSchema = ConversationSummarySchema.extend({
  turns: z.array(ConversationTurnSchema).max(CONVERSATION_MAX_TURNS),
});
export type ConversationDetail = z.infer<typeof ConversationDetailSchema>;

/** Body of `PATCH /api/v1/conversations/:id`. */
export const RenameConversationRequestSchema = z.object({
  title: ConversationTitleSchema,
});
export type RenameConversationRequest = z.infer<typeof RenameConversationRequestSchema>;
