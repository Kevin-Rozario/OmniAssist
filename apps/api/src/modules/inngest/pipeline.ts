import type { EmbeddingClient, VectorStore } from '@omni/rag-core';
import type { ObjectStore } from '../../lib/object-store';
import type { DocumentUploadedPayload } from '../documents/events';
import type { DocumentsRepo, KbDocumentRow } from '../documents/repo';
import { Buffer } from 'node:buffer';
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
  embeddings: EmbeddingClient;
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

interface FetchedObject {
  filename: string;
  contentType: string;
  base64: string;
}

function bytesFromBase64(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, 'base64'));
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

  const fetched = await step.run('fetch-object', async (): Promise<FetchedObject | null> => {
    const row = await requireCurrentRow(deps.repo, documentId, generation);
    if (!row)
      return null;
    const bytes = await deps.objectStore.get(row.storageKey);
    return {
      filename: row.filename,
      contentType: row.contentType,
      base64: Buffer.from(bytes).toString('base64'),
    };
  });
  if (!fetched)
    return { outcome: 'noop', reason: 'missing_or_superseded' };

  const parsed = await step.run('parse-and-chunk', async () => {
    const stillCurrent = await requireCurrentRow(deps.repo, documentId, generation);
    if (!stillCurrent)
      return { kind: 'noop' as const };

    const bytes = bytesFromBase64(fetched.base64);
    const extracted = await extractDocument(bytes, {
      filename: fetched.filename,
      contentType: fetched.contentType,
    });
    if (extracted.empty)
      return { kind: 'empty' as const };

    const extension = resolveExtension({
      filename: fetched.filename,
      contentType: fetched.contentType,
    });
    const chunks = extension === '.md'
      ? chunkMarkdown(extracted.text)
      : chunkText(extracted.text);

    return {
      kind: 'chunks' as const,
      chunks: chunks.map(chunk => ({
        index: chunk.index,
        text: chunk.text,
      })),
      filename: fetched.filename,
    };
  });

  if (parsed.kind === 'noop')
    return { outcome: 'noop', reason: 'missing_or_superseded' };

  if (parsed.kind === 'empty') {
    const errorSummary = 'No extractable text';
    await step.run('mark-failed-empty', async () => {
      await deps.repo.markFailed(documentId, generation, errorSummary);
    });
    return { outcome: 'failed', errorSummary };
  }

  const chunkCount = await step.run('embed-and-upsert', async () => {
    const stillCurrent = await requireCurrentRow(deps.repo, documentId, generation);
    if (!stillCurrent)
      return null;

    const vectors = await deps.embeddings.embed(parsed.chunks.map(chunk => chunk.text));
    await deps.vectorStore.upsertChunks(
      parsed.chunks.map((chunk, index) => ({
        documentId,
        filename: parsed.filename,
        chunkIndex: chunk.index,
        text: chunk.text,
        values: vectors[index] ?? [],
      })),
    );
    return parsed.chunks.length;
  });

  if (chunkCount === null)
    return { outcome: 'noop', reason: 'missing_or_superseded' };

  const ready = await step.run('mark-ready', async () => {
    return deps.repo.markReady(documentId, generation, chunkCount);
  });
  if (!ready)
    return { outcome: 'noop', reason: 'missing_or_superseded' };

  return { outcome: 'ready', chunkCount };
}
