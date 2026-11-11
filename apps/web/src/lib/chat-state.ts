import type { AnswerSource, AskStage, Citation, ConversationTurn, SourceConfidence } from '@omni/types';

/** Why an answer failed, in terms the screen can explain. Never carries provider or server text. */
export type ChatErrorKind
  = | 'invalid_question'
    | 'session_expired'
    | 'conversation_full'
    | 'conversation_missing'
    | 'unavailable'
    | 'stream_failed'
    | 'answer_failed';

export interface ChatError {
  kind: ChatErrorKind;
  /** Support reference from the API, when it sent one. */
  requestId?: string;
}

export type ChatMessageStatus = 'streaming' | 'done' | 'error' | 'stopped';

/** One question and its answer. */
export interface ChatMessage {
  id: string;
  question: string;
  status: ChatMessageStatus;
  /** Current stage while preparing. Cleared once text starts or the answer ends. */
  stage?: AskStage;
  text: string;
  sources: Citation[];
  answerSource?: AnswerSource;
  confidence?: SourceConfidence;
  error?: ChatError;
}

export interface ChatState {
  messages: ChatMessage[];
  /** The saved conversation new questions continue. Unset until an answer has been saved. */
  conversationId?: string;
}

export const initialChatState: ChatState = { messages: [] };

export type ChatAction
  = | { type: 'submit'; id: string; question: string; replaces?: string }
    | { type: 'status'; id: string; stage: AskStage }
    | { type: 'citations'; id: string; sources: Citation[] }
    | { type: 'token'; id: string; text: string }
    | { type: 'done'; id: string; answerSource: AnswerSource; confidence: SourceConfidence; conversationId?: string }
    | { type: 'fail'; id: string; error: ChatError }
    | { type: 'stop'; id: string }
    | { type: 'load'; conversationId: string; turns: ConversationTurn[] }
    | { type: 'newChat' };

export function isChatBusy(state: ChatState): boolean {
  return state.messages.some(message => message.status === 'streaming');
}

function update(
  state: ChatState,
  id: string,
  change: (message: ChatMessage) => ChatMessage,
): ChatState {
  const index = state.messages.findIndex(message => message.id === id);
  const current = state.messages[index];
  // Unknown id, or an answer that already ended: late events change nothing.
  if (!current || current.status !== 'streaming')
    return state;
  const messages = state.messages.slice();
  messages[index] = change(current);
  return { ...state, messages };
}

function ended(message: ChatMessage, status: Exclude<ChatMessageStatus, 'streaming'>): ChatMessage {
  const { stage: _stage, ...rest } = message;
  return { ...rest, status };
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'submit': {
      // One answer at a time.
      if (isChatBusy(state))
        return state;
      const message: ChatMessage = {
        id: action.id,
        question: action.question,
        status: 'streaming',
        text: '',
        sources: [],
      };
      if (action.replaces === undefined) {
        return {
          ...state,
          messages: [...state.messages, message],
        };
      }
      const index = state.messages.findIndex(existing => existing.id === action.replaces);
      if (index === -1) {
        return {
          ...state,
          messages: [...state.messages, message],
        };
      }
      const messages = state.messages.slice();
      messages[index] = message;
      return { ...state, messages };
    }
    case 'status':
      // Progress is only for the wait before the first words.
      return update(state, action.id, message => message.text === ''
        ? { ...message, stage: action.stage }
        : message);
    case 'citations':
      return update(state, action.id, message => ({ ...message, sources: action.sources }));
    case 'token': {
      return update(state, action.id, (message) => {
        const { stage: _stage, ...rest } = message;
        return { ...rest, text: message.text + action.text };
      });
    }
    case 'done': {
      const next = update(state, action.id, message => ({
        ...ended(message, 'done'),
        answerSource: action.answerSource,
        confidence: action.confidence,
      }));
      // The conversation is only known once its first answer has been saved.
      return next !== state && action.conversationId
        ? { ...next, conversationId: action.conversationId }
        : next;
    }
    case 'fail':
      // Whatever text arrived stays visible.
      return update(state, action.id, message => ({
        ...ended(message, 'error'),
        error: action.error,
      }));
    case 'stop':
      return update(state, action.id, message => ended(message, 'stopped'));
    case 'load':
      return {
        conversationId: action.conversationId,
        messages: action.turns.map(turn => ({
          id: turn.id,
          question: turn.question,
          status: 'done' as const,
          text: turn.answer,
          sources: turn.sources,
          answerSource: turn.answerSource,
          confidence: turn.sourceConfidence,
        })),
      };
    case 'newChat':
      return state.messages.length === 0 && state.conversationId === undefined
        ? state
        : initialChatState;
  }
}
