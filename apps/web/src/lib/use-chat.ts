'use client';

import { useAuth } from '@clerk/nextjs';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { askStream } from '@/lib/api-client';
import { createChatController } from '@/lib/chat-controller';
import { isChatBusy } from '@/lib/chat-state';

export function useChat() {
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const [controller] = useState(() => createChatController({
    stream: (question, signal, conversationId) =>
      askStream(() => getTokenRef.current(), question, signal, conversationId),
  }));

  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);

  // Leaving the page ends the request. Strict Mode remounts are harmless: nothing runs yet.
  useEffect(() => controller.abort, [controller]);

  return {
    messages: state.messages,
    conversationId: state.conversationId,
    isBusy: isChatBusy(state),
    ask: useCallback((question: string) => controller.ask(question), [controller]),
    retry: useCallback((id: string) => controller.retry(id), [controller]),
    stop: controller.stop,
    newChat: controller.newChat,
    open: controller.open,
    deleted: controller.deleted,
  };
}
