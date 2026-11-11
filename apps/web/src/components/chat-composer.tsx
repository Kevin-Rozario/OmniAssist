'use client';

import type { FormEvent, KeyboardEvent } from 'react';
import { ASK_QUESTION_MAX_LENGTH } from '@omni/types';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupTextarea,
} from '@omni/ui/components/input-group';
import { SendHorizontalIcon, SquareIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { usableQuestion } from '@/lib/chat-controller';

/** Show the counter once the question is this close to the limit. */
const COUNTER_THRESHOLD = Math.floor(ASK_QUESTION_MAX_LENGTH * 0.8);

interface ChatComposerProps {
  isBusy: boolean;
  /** Returns true when the question was accepted. */
  onSubmit: (question: string) => boolean;
  onStop: () => void;
}

export function ChatComposer({ isBusy, onSubmit, onStop }: ChatComposerProps) {
  const [draft, setDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const counterId = useId();

  // Grow with the text, up to the textarea's max height, then scroll inside it.
  useEffect(() => {
    const element = textareaRef.current;
    if (!element)
      return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [draft]);

  const length = draft.trim().length;
  const overLimit = length > ASK_QUESTION_MAX_LENGTH;
  const canSend = usableQuestion(draft) !== undefined && !isBusy;
  const showCounter = length >= COUNTER_THRESHOLD;
  const remaining = ASK_QUESTION_MAX_LENGTH - length;

  function submit() {
    if (!canSend)
      return;
    if (onSubmit(draft))
      setDraft('');
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Shift+Enter is a new line. Enter during IME composition belongs to the IME.
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing)
      return;
    event.preventDefault();
    submit();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
      <InputGroup className="rounded-2xl border-border bg-card shadow-sm transition-shadow duration-200 focus-within:shadow-md dark:bg-card">
        <InputGroupTextarea
          ref={textareaRef}
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="Ask an IT question"
          aria-label="Ask a question"
          aria-invalid={overLimit || undefined}
          aria-describedby={showCounter ? counterId : undefined}
          className="max-h-40 min-h-12 px-4 py-3.5 text-sm md:text-sm"
        />
        <InputGroupAddon align="block-end" className="pt-0">
          <InputGroupText className="hidden text-xs font-normal sm:flex">
            Enter to send, Shift+Enter for a new line
          </InputGroupText>
          {/* Distinct keys: a shared DOM node would turn the stop click into a submit. */}
          {isBusy
            ? (
                <InputGroupButton
                  key="stop"
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  className="ml-auto rounded-full"
                  onClick={onStop}
                  aria-label="Stop answering"
                >
                  <SquareIcon aria-hidden="true" className="fill-current" />
                </InputGroupButton>
              )
            : (
                <InputGroupButton
                  key="send"
                  type="submit"
                  variant="default"
                  size="icon-sm"
                  className="ml-auto rounded-full transition-transform duration-200 enabled:hover:scale-105"
                  disabled={!canSend}
                  aria-label="Send question"
                >
                  <SendHorizontalIcon aria-hidden="true" />
                </InputGroupButton>
              )}
        </InputGroupAddon>
      </InputGroup>
      <p
        id={counterId}
        className={overLimit
          ? 'min-h-4 px-2 text-xs text-destructive'
          : 'min-h-4 px-2 text-xs text-muted-foreground'}
        hidden={!showCounter}
      >
        {overLimit
          ? `${-remaining} characters over the ${ASK_QUESTION_MAX_LENGTH} limit`
          : `${remaining} characters left`}
      </p>
    </form>
  );
}
