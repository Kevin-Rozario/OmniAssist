'use client';

import { Button } from '@omni/ui/components/button';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@omni/ui/components/conversation';
import { Suggestion } from '@omni/ui/components/suggestion';
import { SquarePenIcon } from 'lucide-react';
import { BrandMark } from '@/components/brand';
import { ChatComposer } from '@/components/chat-composer';
import { ChatMessage } from '@/components/chat-message';
import { HistorySheet } from '@/components/history-sheet';
import { useChat } from '@/lib/use-chat';

const EXAMPLE_QUESTIONS = [
  'How do I set up the VPN?',
  'How do I reset my password?',
  'How do I request new software?',
] as const;

export function ChatView() {
  const { messages, conversationId, isBusy, ask, retry, stop, newChat, open, deleted } = useChat();

  return (
    <section aria-label="Chat" className="mx-auto flex h-full w-full max-w-4xl flex-col gap-3 py-4 sm:gap-4 sm:py-6">
      <div className="flex min-h-8 items-center justify-between gap-2">
        <h1 className="text-sm font-medium text-muted-foreground">
          <span className="sr-only">Chat: </span>
          Ask the IT support copilot a question
        </h1>
        <div className="flex shrink-0 items-center gap-1">
          <HistorySheet openId={conversationId} onOpen={open} onDeleted={deleted} />
          {messages.length > 0
            ? (
                <Button type="button" variant="ghost" size="sm" onClick={newChat} className="shrink-0 text-muted-foreground transition-colors duration-200">
                  <SquarePenIcon aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only">New chat</span>
                </Button>
              )
            : null}
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border bg-card/70 shadow-sm backdrop-blur">
        <Conversation aria-label="Conversation" className="min-h-0 flex-1">
          <ConversationContent className="gap-8 p-4 sm:p-8">
            {messages.length === 0
              ? (
                  <ConversationEmptyState className="gap-6 py-12">
                    <BrandMark className="size-14 rounded-2xl" />
                    <div className="space-y-2">
                      <h2 className="text-2xl font-semibold tracking-tight">How can I help?</h2>
                      <p className="mx-auto max-w-md text-sm text-muted-foreground">
                        I can answer questions about company IT: access, devices, software and policies. Answers show where they came from.
                      </p>
                    </div>
                    <ul aria-label="Example questions" className="flex max-w-xl flex-wrap justify-center gap-2">
                      {EXAMPLE_QUESTIONS.map(question => (
                        <li key={question}>
                          <Suggestion suggestion={question} onClick={ask} className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm" />
                        </li>
                      ))}
                    </ul>
                  </ConversationEmptyState>
                )
              : messages.map(message => (
                  <ChatMessage key={message.id} message={message} canRetry={!isBusy} onRetry={retry} onNewChat={newChat} />
                ))}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      </div>

      <ChatComposer isBusy={isBusy} onSubmit={ask} onStop={stop} />
    </section>
  );
}
