'use client';

import type { DocumentSummary } from '@omni/types';
import { Badge } from '@omni/ui/components/badge';
import { Button } from '@omni/ui/components/button';
import { Skeleton } from '@omni/ui/components/skeleton';
import { useId, useRef, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import {
  documentStatusBadgeVariant,
  documentStatusLabel,
} from '@/lib/document-status';
import {
  useDeleteDocument,
  useDocuments,
  useReingestDocument,
  useUploadDocument,
} from '@/lib/use-documents';
import { useMe } from '@/lib/use-me';

const ACCEPTED_UPLOADS = '.md,.pdf,.txt,.docx';

export function KnowledgeBaseView() {
  const me = useMe();

  if (me.isPending) {
    return (
      <section className="space-y-3 py-6 sm:py-8" aria-busy="true">
        <Skeleton className="h-8 w-48" role="status" aria-label="Loading Knowledge Base" />
        <Skeleton className="h-4 w-72" />
      </section>
    );
  }

  if (me.isError || !me.data) {
    return (
      <section className="py-6 sm:py-8" role="alert">
        <h1 className="text-2xl font-semibold tracking-tight">Knowledge Base</h1>
        <p className="mt-2 text-sm text-destructive">
          Profile unavailable. Retry from the header to load this page.
        </p>
      </section>
    );
  }

  if (me.data.role !== 'admin') {
    return (
      <section className="py-6 sm:py-8" role="alert">
        <h1 className="text-2xl font-semibold tracking-tight">Knowledge Base</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You do not have permission to manage the knowledge base.
        </p>
      </section>
    );
  }

  return <AdminKnowledgeBase />;
}

function AdminKnowledgeBase() {
  const documents = useDocuments();
  const upload = useUploadDocument();
  const remove = useDeleteDocument();
  const reingest = useReingestDocument();
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function onFileSelected(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file)
      return;

    setActionError(null);
    try {
      await upload.mutateAsync(file);
    }
    catch (error) {
      setActionError(errorMessage(error));
    }
    finally {
      if (fileInputRef.current)
        fileInputRef.current.value = '';
    }
  }

  async function onDelete(id: string) {
    setActionError(null);
    try {
      await remove.mutateAsync(id);
      setConfirmDeleteId(null);
    }
    catch (error) {
      setActionError(errorMessage(error));
    }
  }

  async function onRetry(id: string) {
    setActionError(null);
    try {
      await reingest.mutateAsync(id);
    }
    catch (error) {
      setActionError(errorMessage(error));
    }
  }

  return (
    <section className="space-y-6 py-6 sm:py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Knowledge Base</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Upload Markdown, PDF, text, or Word files. Ingestion status updates as each document is processed.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileInputRef}
          id={fileInputId}
          type="file"
          className="sr-only"
          accept={ACCEPTED_UPLOADS}
          onChange={event => void onFileSelected(event.target.files)}
        />
        <Button
          type="button"
          disabled={upload.isPending}
          onClick={() => fileInputRef.current?.click()}
        >
          {upload.isPending ? 'Uploading…' : 'Upload document'}
        </Button>
        <label htmlFor={fileInputId} className="sr-only">
          Choose a knowledge-base file
        </label>
      </div>

      {actionError
        ? (
            <p role="alert" className="text-sm text-destructive">
              {actionError}
            </p>
          )
        : null}

      {documents.isPending
        ? (
            <div className="space-y-2" role="status" aria-label="Loading documents">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          )
        : null}

      {documents.isError
        ? (
            <div role="alert" className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-destructive">Could not load documents.</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void documents.refetch()}>
                Retry
              </Button>
            </div>
          )
        : null}

      {documents.data
        ? (
            <DocumentList
              documents={documents.data.documents}
              confirmDeleteId={confirmDeleteId}
              deleting={remove.isPending}
              retryingId={reingest.isPending
                ? reingest.variables ?? null
                : null}
              onConfirmDelete={setConfirmDeleteId}
              onCancelDelete={() => setConfirmDeleteId(null)}
              onDelete={id => void onDelete(id)}
              onRetry={id => void onRetry(id)}
            />
          )
        : null}
    </section>
  );
}

function DocumentList({
  documents,
  confirmDeleteId,
  deleting,
  retryingId,
  onConfirmDelete,
  onCancelDelete,
  onDelete,
  onRetry,
}: {
  documents: DocumentSummary[];
  confirmDeleteId: string | null;
  deleting: boolean;
  retryingId: string | null;
  onConfirmDelete: (id: string) => void;
  onCancelDelete: () => void;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  if (documents.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No documents yet. Upload a file to start building the knowledge base.
      </p>
    );
  }

  return (
    <ul className="divide-y rounded-2xl border bg-card/70 px-4 shadow-sm backdrop-blur sm:px-6">
      {documents.map(document => (
        <li key={document.id} className="flex flex-col gap-3 py-4 transition-colors duration-200 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-medium">{document.filename}</p>
              <Badge variant={documentStatusBadgeVariant(document.status)}>
                {documentStatusLabel(document.status)}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {formatBytes(document.byteSize)}
              {' · '}
              {new Date(document.createdAt).toLocaleString()}
              {document.chunkCount != null
                ? ` · ${document.chunkCount} chunks`
                : null}
            </p>
            {document.status === 'failed' && document.errorSummary
              ? (
                  <p className="text-sm text-destructive">
                    {document.errorSummary}
                  </p>
                )
              : null}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {document.status === 'failed'
              ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={retryingId === document.id}
                    onClick={() => onRetry(document.id)}
                  >
                    {retryingId === document.id
                      ? 'Retrying…'
                      : 'Retry'}
                  </Button>
                )
              : null}

            {confirmDeleteId === document.id
              ? (
                  <>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={deleting}
                      onClick={() => onDelete(document.id)}
                    >
                      {deleting ? 'Deleting…' : 'Confirm delete'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={deleting}
                      onClick={onCancelDelete}
                    >
                      Cancel
                    </Button>
                  </>
                )
              : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onConfirmDelete(document.id)}
                  >
                    Delete
                  </Button>
                )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError)
    return error.problem.detail || error.problem.title;
  if (error instanceof Error)
    return error.message;
  return 'Something went wrong';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024)
    return `${bytes} B`;
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
