import type { AskStreamEvent, ConversationDetail } from '@omni/types';
import type { ChatAction, ChatState } from './chat-state';
import { ASK_QUESTION_MAX_LENGTH } from '@omni/types';
import { isAbort, toChatError } from './chat-copy';
import { chatReducer, initialChatState, isChatBusy } from './chat-state';

/** Starts one answer, in the given saved conversation or, when undefined, a new one. */
export type AskStream = (
  question: string,
  signal: AbortSignal,
  conversationId: string | undefined,
) => AsyncIterable<AskStreamEvent>;

export interface ChatController {
  getState: () => ChatState;
  subscribe: (listener: () => void) => () => void;
  /** Start an answer. Returns false, sending nothing, if the question is unusable or an answer is running. */
  ask: (question: string) => boolean;
  /** Ask a failed message's question again, in the failed message's place. */
  retry: (id: string) => boolean;
  /** End the running answer, keeping the text so far. */
  stop: () => void;
  /** End the running answer and empty the screen; the next question starts a new conversation. */
  newChat: () => void;
  /** End the running answer and show a saved conversation, which new questions then continue. */
  open: (conversation: ConversationDetail) => void;
  /** Tell the controller a conversation was deleted; if it is the open one the screen is emptied. */
  deleted: (conversationId: string) => void;
  /** End the running request without touching the conversation, for when the page goes away. */
  abort: () => void;
}

export interface ChatControllerOptions {
  stream: AskStream;
  newId?: () => string;
}

/** The question as it will be sent, or undefined if it must not be sent. */
export function usableQuestion(question: string): string | undefined {
  const trimmed = question.trim();
  if (trimmed === '' || trimmed.length > ASK_QUESTION_MAX_LENGTH)
    return undefined;
  return trimmed;
}

export function createChatController(options: ChatControllerOptions): ChatController {
  const { stream, newId = () => globalThis.crypto.randomUUID() } = options;
  const listeners = new Set<() => void>();
  let state = initialChatState;
  let running: { id: string; abort: AbortController } | undefined;

  function dispatch(action: ChatAction): void {
    const next = chatReducer(state, action);
    if (next === state)
      return;
    state = next;
    for (const listener of listeners)
      listener();
  }

  function endRunning(): { id: string } | undefined {
    const current = running;
    running = undefined;
    current?.abort.abort();
    return current;
  }

  async function run(id: string, question: string, replaces?: string): Promise<void> {
    dispatch({
      type: 'submit',
      id,
      question,
      replaces,
    });
    const abort = new AbortController();
    const current = { id, abort };
    running = current;
    // Late events from an answer that was stopped, cleared or replaced are dropped.
    const live = () => !abort.signal.aborted && running === current;

    try {
      for await (const event of stream(question, abort.signal, state.conversationId)) {
        if (!live())
          return;
        switch (event.event) {
          case 'status':
            dispatch({ type: 'status', id, stage: event.data.stage });
            break;
          case 'citations':
            dispatch({ type: 'citations', id, sources: event.data.sources });
            break;
          case 'token':
            dispatch({ type: 'token', id, text: event.data.text });
            break;
          case 'done':
            dispatch({
              type: 'done',
              id,
              answerSource: event.data.answerSource,
              confidence: event.data.sourceConfidence,
              conversationId: event.data.conversationId,
            });
            break;
          case 'error':
            dispatch({
              type: 'fail',
              id,
              error: { kind: 'answer_failed', requestId: event.data.requestId },
            });
            break;
        }
      }
      // The stream must end with `done` or `error`; anything else is a broken stream.
      if (live()) {
        dispatch({
          type: 'fail',
          id,
          error: { kind: 'stream_failed' },
        });
      }
    }
    catch (error) {
      if (live() && !isAbort(error)) {
        dispatch({
          type: 'fail',
          id,
          error: toChatError(error),
        });
      }
    }
    finally {
      if (running === current)
        running = undefined;
    }
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    ask(question) {
      const usable = usableQuestion(question);
      if (usable === undefined || isChatBusy(state))
        return false;
      void run(newId(), usable);
      return true;
    },
    retry(id) {
      const failed = state.messages.find(message => message.id === id);
      if (!failed || failed.status !== 'error' || isChatBusy(state))
        return false;
      void run(newId(), failed.question, id);
      return true;
    },
    stop() {
      const current = endRunning();
      if (current)
        dispatch({ type: 'stop', id: current.id });
    },
    newChat() {
      endRunning();
      dispatch({ type: 'newChat' });
    },
    open(conversation) {
      endRunning();
      dispatch({ type: 'load', conversationId: conversation.id, turns: conversation.turns });
    },
    deleted(conversationId) {
      if (state.conversationId !== conversationId)
        return;
      endRunning();
      dispatch({ type: 'newChat' });
    },
    abort() {
      endRunning();
    },
  };
}
