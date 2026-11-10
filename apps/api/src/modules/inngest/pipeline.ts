import type { VectorStore } from '@omni/rag-core';
import type { ObjectStore } from '../../lib/object-store';
import type { DocumentUploadedPayload } from '../documents/events';
import type { DocumentsRepo, KbDocumentRow } from '../documents/repo';
import {
  chunkMarkdown,
  chunkText,
  extractDocument,
  resolveExtension,
} from '@omni/ingestion';
import { sanitizeErrorSummary } from './sanitize';

export interface IngestPipelineDeps {
  repo: DocumentsRepo;
  objectStore: ObjectStore;
  vectorStore: VectorStore;
}

/** Minimal step runner so Vitest can exercise the same flow Inngest wraps. */
export interface IngestStepRunner {
  run: <T>(id: string, fn: () => Promise<T>) => Promise<T>;
}

export const passthroughStepRunner: IngestStepRunner = {
  run: async (_id, fn) => fn(),
};

export type IngestOutcome
  = | { outcome: 'ready'; chunkCount: number }
    | { outcome: 'failed'; errorSummary: string }
    | { outcome: 'noop'; reason: 'missing_or_superseded' };

type LoadedChunks
  = | { kind: 'noop' }
    | { kind: 'empty' }
    | {
      kind: 'chunks';
      filename: string;
      chunks: Array<{ index: number; text: string }>;
    };

async function loadChunks(
  deps: IngestPipelineDeps,
  documentId: string,
  generation: number,
): Promise<LoadedChunks> {
  const row = await requireCurrentRow(deps.repo, documentId, generation);
  if (!row)
    return { kind: 'noop' };

  const bytes = await deps.objectStore.get(row.storageKey);
  const extracted = await extractDocument(bytes, {
    filename: row.filename,
    contentType: row.contentType,
  });
  if (extracted.empty)
    return { kind: 'empty' };

  const extension = resolveExtension({
    filename: row.filename,
    contentType: row.contentType,
  });
  const chunks = extension === '.md'
    ? chunkMarkdown(extracted.text)
    : chunkText(extracted.text);

  return {
    kind: 'chunks',
    filename: row.filename,
    chunks: chunks.map(chunk => ({
      index: chunk.index,
      text: chunk.text,
    })),
  };
}

async function requireCurrentRow(
  repo: DocumentsRepo,
  documentId: string,
  generation: number,
): Promise<KbDocumentRow | null> {
  const row = await repo.findById(documentId);
  if (!row || row.ingestionGeneration !== generation)
    return null;
  return row;
}

/** Mark failed after Inngest retries are exhausted (or in tests simulating that). */
export async function markIngestFailed(
  deps: Pick<IngestPipelineDeps, 'repo'>,
  payload: DocumentUploadedPayload,
  error: unknown,
): Promise<string> {
  const errorSummary = sanitizeErrorSummary(error);
  await deps.repo.markFailed(payload.documentId, payload.generation, errorSummary);
  return errorSummary;
}

export async function runIngestPipeline(
  deps: IngestPipelineDeps,
  step: IngestStepRunner,
  payload: DocumentUploadedPayload,
): Promise<IngestOutcome> {
  const { documentId, generation } = payload;

  const processing = await step.run('mark-processing', async () => {
    return deps.repo.markProcessing(documentId, generation);
  });
  if (!processing)
    return { outcome: 'noop', reason: 'missing_or_superseded' };

  // Parse and upsert in one step. Inngest stores step output (4 MiB cap), so the
  // step returns only a count. The object bytes are read inside the step.
  const parsed = await step.run('parse-and-upsert', async () => {
    const loaded = await loadChunks(deps, documentId, generation);
    if (loaded.kind !== 'chunks')
      return loaded;

    await deps.vectorStore.upsertChunks(loaded.chunks.map(chunk => ({
      documentId,
      filename: loaded.filename,
      chunkIndex: chunk.index,
      text: chunk.text,
    })));

    // A delete or re-ingest can land while this upsert is in flight. Drop the
    // vectors we just wrote so they are not left behind for a removed generation.
    const stillCurrent = await requireCurrentRow(deps.repo, documentId, generation);
    if (!stillCurrent) {
      await deps.vectorStore.deleteByDocumentId(documentId);
      return { kind: 'noop' as const };
    }

    return { kind: 'chunks' as const, chunkCount: loaded.chunks.length };
  });

  if (parsed.kind === 'noop')
    return { outcome: 'noop', reason: 'missing_or_superseded' };

  if (parsed.kind === 'empty') {
    const errorSummary = 'No extractable text';
    await step.run('mark-failed-empty', async () => {
      await markIngestFailed(deps, payload, errorSummary);
    });
    return { outcome: 'failed', errorSummary };
  }

  const chunkCount = parsed.chunkCount;

  const ready = await step.run('mark-ready', async () => {
    return deps.repo.markReady(documentId, generation, chunkCount);
  });
  if (!ready)
    return { outcome: 'noop', reason: 'missing_or_superseded' };

  return { outcome: 'ready', chunkCount };
}
