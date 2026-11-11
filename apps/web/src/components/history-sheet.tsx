'use client';

import type { ConversationDetail } from '@omni/types';
import { useAuth } from '@clerk/nextjs';
import { Button } from '@omni/ui/components/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@omni/ui/components/sheet';
import { useQueryClient } from '@tanstack/react-query';
import { HistoryIcon } from 'lucide-react';
import { useState } from 'react';
import { HistoryList } from '@/components/history-list';
import { ApiError, getConversation } from '@/lib/api-client';
import { historyErrorMessage } from '@/lib/chat-copy';
import { conversationsQueryKey, useConversationList, useDeleteConversation, useRenameConversation } from '@/lib/use-conversations';

interface HistorySheetProps {
  /** The conversation currently open on the screen. */
  openId?: string;
  /** Show a saved conversation. Stops any running answer first. */
  onOpen: (conversation: ConversationDetail) => void;
  /** A conversation was deleted; the screen resets if it was the open one. */
  onDeleted: (id: string) => void;
}

/** Mounted only while the sheet is open, so the list is fetched fresh each time it is shown. */
function HistoryPanel({
  openId,
  onOpen,
  onDeleted,
  onClose,
}: HistorySheetProps & { onClose: () => void }) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const list = useConversationList();
  const rename = useRenameConversation();
  const remove = useDeleteConversation();
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function failed(error: unknown, action: 'open' | 'rename' | 'delete') {
    setActionError(historyErrorMessage(error, action));
    // A 404 means the list is out of date.
    if (error instanceof ApiError && error.problem.status === 404)
      await queryClient.invalidateQueries({ queryKey: conversationsQueryKey });
  }

  async function onOpenConversation(id: string) {
    setActionError(null);
    setOpeningId(id);
    try {
      onOpen(await getConversation(getToken, id));
      onClose();
    }
    catch (error) {
      await failed(error, 'open');
    }
    finally {
      setOpeningId(null);
    }
  }

  async function onRename(id: string, title: string) {
    setActionError(null);
    try {
      await rename.mutateAsync({ id, title });
      setRenamingId(null);
    }
    catch (error) {
      await failed(error, 'rename');
    }
  }

  async function onDelete(id: string) {
    setActionError(null);
    try {
      await remove.mutateAsync(id);
      setConfirmDeleteId(null);
      onDeleted(id);
    }
    catch (error) {
      setConfirmDeleteId(null);
      await failed(error, 'delete');
    }
  }

  const status = list.isPending
    ? 'loading'
    : list.isError
      ? 'error'
      : 'ready';

  return (
    <HistoryList
      status={status}
      conversations={list.data?.conversations ?? []}
      openId={openId}
      openingId={openingId}
      renamingId={renamingId}
      renamePending={rename.isPending}
      confirmDeleteId={confirmDeleteId}
      deletePending={remove.isPending}
      actionError={actionError}
      loadError={list.isError
        ? historyErrorMessage(list.error, 'load')
        : undefined}
      onOpen={id => void onOpenConversation(id)}
      onRetryLoad={() => void list.refetch()}
      onStartRename={(id) => {
        setActionError(null);
        setConfirmDeleteId(null);
        setRenamingId(id);
      }}
      onCancelRename={() => setRenamingId(null)}
      onRename={(id, title) => void onRename(id, title)}
      onConfirmDelete={(id) => {
        setActionError(null);
        setRenamingId(null);
        setConfirmDeleteId(id);
      }}
      onCancelDelete={() => setConfirmDeleteId(null)}
      onDelete={id => void onDelete(id)}
      onStartChat={onClose}
    />
  );
}

export function HistorySheet(props: HistorySheetProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="shrink-0 text-muted-foreground transition-colors duration-200">
          <HistoryIcon aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">History</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="pr-12">
          <SheetTitle>History</SheetTitle>
          <SheetDescription>Pick up an earlier conversation, rename it or delete it.</SheetDescription>
        </SheetHeader>
        {open
          ? <HistoryPanel {...props} onClose={() => setOpen(false)} />
          : null}
      </SheetContent>
    </Sheet>
  );
}
