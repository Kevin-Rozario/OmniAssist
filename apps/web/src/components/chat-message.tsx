'use client';

import type { ChatMessage as ChatMessageData } from '@/lib/chat-state';
import { Badge } from '@omni/ui/components/badge';
import { Button } from '@omni/ui/components/button';
import { Loader } from '@omni/ui/components/loader';
import { ExternalLinkIcon, RotateCcwIcon, SquarePenIcon, TriangleAlertIcon } from 'lucide-react';
import { memo } from 'react';
import { BrandMark } from '@/components/brand';
import { answerOrigin, errorMessage, needsNewChat, safeHttpUrl, stageLabel, tightenListSpacing } from '@/lib/chat-copy';

interface ChatMessageProps {
  message: ChatMessageData;
  /** False while another answer is running, so retry is not offered. */
  canRetry: boolean;
  onRetry: (id: string) => void;
  /** Offered instead of retry when the conversation is full or gone. */
  onNewChat?: () => void;
}

function Sources({ sources }: { sources: ChatMessageData['sources'] }) {
  if (sources.length === 0)
    return null;
  return (
    <div className="mt-4 text-xs text-muted-foreground">
      <p className="font-medium">Sources</p>
      <ol className="mt-2 flex flex-wrap gap-2">
        {sources.map((source) => {
          const href = source.kind === 'web'
            ? safeHttpUrl(source.url)
            : undefined;
          return (
            <li key={`${source.n}-${source.kind}`} className="flex max-w-full gap-1.5 rounded-full border bg-background/60 px-3 py-1 transition-colors duration-200 hover:bg-accent/50">
              <span aria-hidden="true">{`[${source.n}]`}</span>
              <span className="sr-only">{`Source ${source.n}: `}</span>
              {source.kind === 'kb'
                ? <span className="min-w-0 break-words">{source.filename}</span>
                : href
                  ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-w-0 items-center gap-1 break-words text-foreground underline underline-offset-2 hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none"
                      >
                        {source.title || href}
                        <ExternalLinkIcon aria-hidden="true" className="size-3 shrink-0" />
                        <span className="sr-only">(opens in a new tab)</span>
                      </a>
                    )
                  : <span className="min-w-0 break-words">{source.title || source.url}</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Origin({ message }: { message: ChatMessageData }) {
  if (message.status !== 'done' || !message.answerSource || !message.confidence)
    return null;
  const origin = answerOrigin(message.answerSource, message.confidence);
  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={message.answerSource === 'fallback'
          ? 'outline'
          : 'secondary'}
        >
          {origin.label}
        </Badge>
        {origin.confidence
          ? <Badge variant="outline">{origin.confidence}</Badge>
          : null}
      </div>
      {origin.notice
        ? (
            <p role="note" className="flex gap-1.5 text-xs text-muted-foreground">
              <TriangleAlertIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              {origin.notice}
            </p>
          )
        : null}
    </div>
  );
}

function ChatMessageView({ message, canRetry, onRetry, onNewChat }: ChatMessageProps) {
  const isStreaming = message.status === 'streaming';
  const waiting = isStreaming && message.text === '';

  return (
    <article className="space-y-4" aria-busy={isStreaming}>
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm break-words whitespace-pre-wrap text-primary-foreground shadow-sm">
          <span className="sr-only">You asked: </span>
          {message.question}
        </p>
      </div>

      <div className="flex items-start gap-3">
        <BrandMark className="mt-0.5 size-7 rounded-lg" />
        <div className="min-w-0 flex-1 text-sm">
          {waiting
            ? (
                <div role="status" className="flex items-center gap-2 text-muted-foreground">
                  <span aria-hidden="true"><Loader size={16} /></span>
                  {stageLabel(message.stage ?? 'routing')}
                </div>
              )
            : null}

          {isStreaming || message.text !== ''
            ? (
                <div aria-live="polite" className="leading-relaxed break-words whitespace-pre-wrap">
                  {tightenListSpacing(message.text)}
                </div>
              )
            : null}

          {message.status === 'stopped'
            ? <p className="mt-2 text-xs text-muted-foreground">Stopped. This answer may be incomplete.</p>
            : null}

          {message.status === 'error' && message.error
            ? (
                <div role="alert" className="mt-2 space-y-2">
                  {message.text !== ''
                    ? <p className="text-xs text-muted-foreground">This answer is incomplete.</p>
                    : null}
                  <p className="flex gap-1.5 text-destructive">
                    <TriangleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                    {errorMessage(message.error)}
                  </p>
                  {message.error.requestId
                    ? <p className="text-xs text-muted-foreground">{`Reference: ${message.error.requestId}`}</p>
                    : null}
                  {needsNewChat(message.error)
                    ? (onNewChat
                        ? (
                            <Button type="button" variant="outline" size="sm" onClick={onNewChat}>
                              <SquarePenIcon aria-hidden="true" />
                              New chat
                            </Button>
                          )
                        : null)
                    : canRetry
                      ? (
                          <Button type="button" variant="outline" size="sm" onClick={() => onRetry(message.id)}>
                            <RotateCcwIcon aria-hidden="true" />
                            Try again
                          </Button>
                        )
                      : null}
                </div>
              )
            : null}

          <Sources sources={message.sources} />
          <Origin message={message} />
        </div>
      </div>
    </article>
  );
}

/** Settled messages keep their identity between updates, so only the streaming one re-renders. */
export const ChatMessage = memo(ChatMessageView);
