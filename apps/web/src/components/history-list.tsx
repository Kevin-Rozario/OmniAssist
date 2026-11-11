'use client';

import type { ConversationSummary } from '@omni/types';
import type { FormEvent, KeyboardEvent } from 'react';
import { CONVERSATION_TITLE_MAX_LENGTH } from '@omni/types';
import { Button } from '@omni/ui/components/button';
import { Input } from '@omni/ui/components/input';
import { Skeleton } from '@omni/ui/components/skeleton';
import { CheckIcon, MessageSquareIcon, PencilIcon, SquarePenIcon, Trash2Icon, TriangleAlertIcon, XIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

export type HistoryListStatus = 'loading' | 'error' | 'ready';

export interface HistoryListProps {
  status: HistoryListStatus;
  conversations: ConversationSummary[];
  /** The conversation currently open on the screen. */
  openId?: string;
  /** The conversation being fetched after a click. */
  openingId?: string | null;
  renamingId?: string | null;
  renamePending?: boolean;
  confirmDeleteId?: string | null;
  deletePending?: boolean;
  /** Plain-language failure of the last open, rename or delete. */
  actionError?: string | null;
  /** Plain-language failure of loading the list. */
  loadError?: string;
  onOpen: (id: string) => void;
  onRetryLoad: () => void;
  onStartRename: (id: string) => void;
  onCancelRename: () => void;
  onRename: (id: string, title: string) => void;
  onConfirmDelete: (id: string) => void;
  onCancelDelete: () => void;
  onDelete: (id: string) => void;
  /** Empty state action: close the list and let the user ask. */
  onStartChat: () => void;
}

const timeFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });

function formatWhen(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : timeFormat.format(date);
}

function RenameForm({
  conversation,
  pending,
  onSubmit,
  onCancel,
}: {
  conversation: ConversationSummary;
  pending: boolean;
  onSubmit: (title: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(conversation.title);
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const empty = draft.trim() === '';

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (empty || pending)
      return;
    onSubmit(draft.trim());
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      // Keep Escape from also closing the sheet.
      event.stopPropagation();
      onCancel();
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-1.5" noValidate>
      <div className="flex items-center gap-1.5">
        <Input
          ref={inputRef}
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          maxLength={CONVERSATION_TITLE_MAX_LENGTH}
          disabled={pending}
          aria-label={`Title for ${conversation.title}`}
          aria-invalid={touched && empty}
          aria-describedby={touched && empty
            ? errorId
            : undefined}
          className="h-8 min-w-0 flex-1"
        />
        <Button type="submit" size="icon-sm" variant="ghost" disabled={pending} aria-label="Save title">
          <CheckIcon aria-hidden="true" />
        </Button>
        <Button type="button" size="icon-sm" variant="ghost" disabled={pending} onClick={onCancel} aria-label="Cancel rename">
          <XIcon aria-hidden="true" />
        </Button>
      </div>
      {touched && empty
        ? <p id={errorId} role="alert" className="text-xs text-destructive">Enter a title.</p>
        : null}
    </form>
  );
}

function Row({ conversation, props }: { conversation: ConversationSummary; props: HistoryListProps }) {
  const {
    openId,
    openingId,
    renamingId,
    renamePending,
    confirmDeleteId,
    deletePending,
    onOpen,
    onStartRename,
    onCancelRename,
    onRename,
    onConfirmDelete,
    onCancelDelete,
    onDelete,
  } = props;
  const isOpen = conversation.id === openId;
  const isOpening = conversation.id === openingId;
  const isRenaming = conversation.id === renamingId;
  const isConfirming = conversation.id === confirmDeleteId;
  const when = formatWhen(conversation.updatedAt);

  return (
    <li
      data-current={isOpen
        ? 'true'
        : undefined}
      className="rounded-xl border bg-card/60 p-1.5 transition-colors duration-200 data-[current=true]:border-primary/40 data-[current=true]:bg-accent/60"
    >
      {isRenaming
        ? (
            <div className="p-1.5">
              <RenameForm
                conversation={conversation}
                pending={renamePending ?? false}
                onSubmit={title => onRename(conversation.id, title)}
                onCancel={onCancelRename}
              />
            </div>
          )
        : (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onOpen(conversation.id)}
                disabled={isOpening || (deletePending && isConfirming)}
                aria-current={isOpen
                  ? 'true'
                  : undefined}
                className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-lg px-2.5 py-1.5 text-left transition-colors duration-200 outline-none hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60"
              >
                <span className="truncate text-sm font-medium">{conversation.title}</span>
                <span className="text-xs text-muted-foreground">
                  {isOpening
                    ? 'Opening…'
                    : when}
                </span>
              </button>
              {isConfirming
                ? null
                : (
                    <div className="flex shrink-0 items-center">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => onStartRename(conversation.id)}
                        aria-label={`Rename ${conversation.title}`}
                        className="text-muted-foreground"
                      >
                        <PencilIcon aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => onConfirmDelete(conversation.id)}
                        aria-label={`Delete ${conversation.title}`}
                        className="text-muted-foreground"
                      >
                        <Trash2Icon aria-hidden="true" />
                      </Button>
                    </div>
                  )}
            </div>
          )}
      {isConfirming
        ? (
            <div role="group" aria-label={`Confirm deleting ${conversation.title}`} className="flex flex-wrap items-center justify-between gap-2 px-2.5 pt-1 pb-1.5">
              <p className="text-xs text-muted-foreground">Delete this conversation for good?</p>
              <div className="flex gap-1.5">
                <Button type="button" variant="destructive" size="sm" disabled={deletePending} onClick={() => onDelete(conversation.id)}>
                  {deletePending
                    ? 'Deleting…'
                    : 'Delete'}
                </Button>
                <Button type="button" variant="ghost" size="sm" disabled={deletePending} onClick={onCancelDelete}>
                  Cancel
                </Button>
              </div>
            </div>
          )
        : null}
    </li>
  );
}

/** The list inside the History sheet. Pure of data fetching so every state can be rendered on its own. */
export function HistoryList(props: HistoryListProps) {
  const { status, conversations, actionError, loadError, onRetryLoad, onStartChat } = props;

  if (status === 'loading') {
    return (
      <div role="status" aria-label="Loading conversations" className="flex flex-col gap-2 px-4">
        <span className="sr-only">Loading conversations</span>
        {[0, 1, 2].map(index => (
          <Skeleton key={index} className="h-14 rounded-xl" />
        ))}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div role="alert" className="mx-4 flex flex-col items-start gap-3 rounded-xl border border-destructive/30 p-4">
        <p className="flex gap-1.5 text-sm text-destructive">
          <TriangleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {loadError ?? 'We couldn\'t load your conversations.'}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={onRetryLoad}>
          Try again
        </Button>
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="mx-4 flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-10 text-center">
        <MessageSquareIcon aria-hidden="true" className="size-6 text-muted-foreground" />
        <div className="space-y-1">
          <p className="text-sm font-medium">No saved conversations yet</p>
          <p className="text-xs text-muted-foreground">Your questions and answers are saved here once an answer finishes.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onStartChat}>
          <SquarePenIcon aria-hidden="true" />
          Start a chat
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {actionError
        ? (
            <p role="alert" className="mx-4 flex gap-1.5 rounded-lg border border-destructive/30 px-3 py-2 text-xs text-destructive">
              <TriangleAlertIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              {actionError}
            </p>
          )
        : null}
      <ul aria-label="Saved conversations" className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pb-4">
        {conversations.map(conversation => (
          <Row key={conversation.id} conversation={conversation} props={props} />
        ))}
      </ul>
    </div>
  );
}
