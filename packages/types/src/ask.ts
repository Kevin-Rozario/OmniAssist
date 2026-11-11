import { z } from 'zod';

export const ASK_QUESTION_MAX_LENGTH = 2000;

/** Request body for `POST /api/v1/ask`. The question is trimmed before length checks. */
export const AskRequestSchema = z.object({
  question: z.string().trim().min(1).max(ASK_QUESTION_MAX_LENGTH),
  /** Continue one of the caller's conversations. Omit it to start a new one. */
  conversationId: z.uuid().optional(),
});
export type AskRequest = z.infer<typeof AskRequestSchema>;

/** Where a completed answer came from. */
export const AnswerSourceSchema = z.enum(['kb', 'web', 'fallback', 'direct']);
export type AnswerSource = z.infer<typeof AnswerSourceSchema>;

export const SourceConfidenceSchema = z.enum([
  'high',
  'medium',
  'low',
  'not_applicable',
]);
export type SourceConfidence = z.infer<typeof SourceConfidenceSchema>;

export const SOURCE_CONFIDENCE_BY_ANSWER_SOURCE = {
  kb: 'high',
  web: 'medium',
  fallback: 'low',
  direct: 'not_applicable',
} as const satisfies Record<AnswerSource, SourceConfidence>;

/** Source confidence is always derived from the answer source. */
export function sourceConfidenceFor(source: AnswerSource): SourceConfidence {
  return SOURCE_CONFIDENCE_BY_ANSWER_SOURCE[source];
}

export const AskStageSchema = z.enum([
  'routing',
  'searching_kb',
  'grading',
  'searching_web',
  'writing',
]);
export type AskStage = z.infer<typeof AskStageSchema>;

export const AskStatusEventSchema = z.object({
  stage: AskStageSchema,
});
export type AskStatusEvent = z.infer<typeof AskStatusEventSchema>;

export const KbCitationSchema = z.object({
  n: z.int().positive(),
  kind: z.literal('kb'),
  documentId: z.string().min(1),
  filename: z.string().min(1),
});
export type KbCitation = z.infer<typeof KbCitationSchema>;

export const WebCitationSchema = z.object({
  n: z.int().positive(),
  kind: z.literal('web'),
  title: z.string(),
  url: z.url(),
});
export type WebCitation = z.infer<typeof WebCitationSchema>;

export const CitationSchema = z.discriminatedUnion('kind', [
  KbCitationSchema,
  WebCitationSchema,
]);
export type Citation = z.infer<typeof CitationSchema>;

export const AskCitationsEventSchema = z.object({
  sources: z.array(CitationSchema),
});
export type AskCitationsEvent = z.infer<typeof AskCitationsEventSchema>;

export const AskTokenEventSchema = z.object({
  text: z.string(),
});
export type AskTokenEvent = z.infer<typeof AskTokenEventSchema>;

export const AskDoneEventSchema = z.object({
  answerSource: AnswerSourceSchema,
  sourceConfidence: SourceConfidenceSchema,
  /** The conversation the exchange was saved to, so a client can continue it. */
  conversationId: z.uuid().optional(),
});
export type AskDoneEvent = z.infer<typeof AskDoneEventSchema>;

/** Sanitized failure after the stream started: no provider message, stack or passage text. */
export const AskErrorEventSchema = z.object({
  type: z.string().min(1),
  title: z.string().min(1),
  requestId: z.string().min(1),
});
export type AskErrorEvent = z.infer<typeof AskErrorEventSchema>;

/** SSE event name to JSON payload schema, for the route and any client. */
export const AskEventSchemas = {
  status: AskStatusEventSchema,
  citations: AskCitationsEventSchema,
  token: AskTokenEventSchema,
  done: AskDoneEventSchema,
  error: AskErrorEventSchema,
} as const;

export const AskEventNameSchema = z.enum([
  'status',
  'citations',
  'token',
  'done',
  'error',
]);
export type AskEventName = z.infer<typeof AskEventNameSchema>;
