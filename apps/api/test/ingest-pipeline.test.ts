import type { KbDocumentRow } from '../src/modules/documents/repo';
import type { IngestStepRunner } from '../src/modules/inngest/pipeline';
import { describe, expect, it } from 'vitest';
import { createInngestClient } from '../src/modules/inngest/client';
import { createIngestDocumentFunction } from '../src/modules/inngest/functions';
import {
  markIngestFailed,
  runIngestPipeline,
} from '../src/modules/inngest/pipeline';
import { sanitizeErrorSummary } from '../src/modules/inngest/sanitize';
import { fakeObjectStore, fakeVectorStore } from './fakes';
import { memoryDocumentsRepo } from './memory-documents-repo';

const passthroughStepRunner: IngestStepRunner = {
  run: async (_id, fn) => fn(),
};

const DOC_ID = '019a1b2c-3d4e-7f80-9abc-def012345678';

function seedRow(overrides: Partial<KbDocumentRow> = {}): KbDocumentRow {
  const now = new Date('2026-11-10T12:00:00.000Z');
  return {
    id: DOC_ID,
    filename: 'vpn.txt',
    contentType: 'text/plain',
    byteSize: 12,
    storageKey: `kb/${DOC_ID}/vpn.txt`,
    status: 'pending',
    errorSummary: null,
    chunkCount: null,
    contentHash: 'a'.repeat(64),
    ingestionGeneration: 1,
    uploadedBy: 'user_admin',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('sanitizeErrorSummary', () => {
  it('strips secret-looking tokens', () => {
    expect(sanitizeErrorSummary(new Error('OpenAI failed sk-openai_secret_value')))
      .not
      .toContain('sk-openai_secret_value');
    expect(sanitizeErrorSummary('signkey-inngest_secret_value')).toContain('[redacted]');
  });
});

describe('runIngestPipeline', () => {
  it('marks a clean text document ready and upserts chunks', async () => {
    const bytes = new TextEncoder().encode('VPN access uses WireGuard on udp/51820.');
    const repo = memoryDocumentsRepo([
      seedRow({ byteSize: bytes.byteLength }),
    ]);
    const vectorStore = fakeVectorStore();
    const steps: string[] = [];
    const step = {
      run: async <T>(id: string, fn: () => Promise<T>) => {
        steps.push(id);
        return fn();
      },
    };
    const result = await runIngestPipeline({
      repo,
      objectStore: fakeObjectStore({ [`kb/${DOC_ID}/vpn.txt`]: bytes }),
      vectorStore,
    }, step, { documentId: DOC_ID, generation: 1 });

    expect(steps).toEqual([
      'mark-processing',
      'parse-and-upsert',
      'mark-ready',
    ]);
    expect(result).toEqual({ outcome: 'ready', chunkCount: 1 });
    const row = await repo.findById(DOC_ID);
    expect(row).toMatchObject({ status: 'ready', chunkCount: 1, errorSummary: null });
    expect(vectorStore.upserts).toHaveLength(1);
    expect(vectorStore.upserts[0]).toEqual([
      expect.objectContaining({
        documentId: DOC_ID,
        filename: 'vpn.txt',
        chunkIndex: 0,
      }),
    ]);
  });

  it('marks empty extractable text as failed', async () => {
    const bytes = new TextEncoder().encode('   \n\t  ');
    const repo = memoryDocumentsRepo([
      seedRow({
        filename: 'empty.txt',
        storageKey: `kb/${DOC_ID}/empty.txt`,
        byteSize: bytes.byteLength,
      }),
    ]);

    const result = await runIngestPipeline({
      repo,
      objectStore: fakeObjectStore({ [`kb/${DOC_ID}/empty.txt`]: bytes }),
      vectorStore: fakeVectorStore(),
    }, passthroughStepRunner, { documentId: DOC_ID, generation: 1 });

    expect(result).toEqual({ outcome: 'failed', errorSummary: 'No extractable text' });
    expect(await repo.findById(DOC_ID)).toMatchObject({
      status: 'failed',
      errorSummary: 'No extractable text',
    });
  });

  it('removes vectors written after the document was deleted mid-upsert', async () => {
    const bytes = new TextEncoder().encode('VPN access uses WireGuard on udp/51820.');
    const repo = memoryDocumentsRepo([
      seedRow({ byteSize: bytes.byteLength }),
    ]);
    const vectorStore = fakeVectorStore();
    vectorStore.upsertChunks = async (chunks) => {
      vectorStore.upserts.push(chunks);
      await repo.delete(DOC_ID);
    };

    const result = await runIngestPipeline({
      repo,
      objectStore: fakeObjectStore({ [`kb/${DOC_ID}/vpn.txt`]: bytes }),
      vectorStore,
    }, passthroughStepRunner, { documentId: DOC_ID, generation: 1 });

    expect(result).toEqual({ outcome: 'noop', reason: 'missing_or_superseded' });
    expect(vectorStore.deleted).toEqual([DOC_ID]);
    expect(await repo.findById(DOC_ID)).toBeNull();
  });

  it('runs one ingestion at a time for a document', () => {
    const inngest = createInngestClient({ eventKey: 'test-event-key' });
    const fn = createIngestDocumentFunction(inngest, {
      repo: memoryDocumentsRepo(),
      objectStore: fakeObjectStore(),
      vectorStore: fakeVectorStore(),
    });

    expect(fn.opts.concurrency).toEqual({
      limit: 1,
      key: 'event.data.documentId',
    });
    expect(fn.opts.retries).toBe(3);
    expect(fn.opts.triggers).toEqual([
      { event: 'kb/document.uploaded' },
    ]);
  });

  it('no-ops when generation was superseded by delete', async () => {
    const bytes = new TextEncoder().encode('still here');
    const repo = memoryDocumentsRepo([
      seedRow({ byteSize: bytes.byteLength }),
    ]);
    await repo.delete(DOC_ID);

    const result = await runIngestPipeline({
      repo,
      objectStore: fakeObjectStore({ [`kb/${DOC_ID}/vpn.txt`]: bytes }),
      vectorStore: fakeVectorStore(),
    }, passthroughStepRunner, { documentId: DOC_ID, generation: 1 });

    expect(result).toEqual({ outcome: 'noop', reason: 'missing_or_superseded' });
    expect(await repo.findById(DOC_ID)).toBeNull();
  });

  it('no-ops when a newer generation superseded the event', async () => {
    const bytes = new TextEncoder().encode('policy text');
    const repo = memoryDocumentsRepo([
      seedRow({
        ingestionGeneration: 2,
        status: 'pending',
        byteSize: bytes.byteLength,
      }),
    ]);
    const vectorStore = fakeVectorStore();

    const result = await runIngestPipeline({
      repo,
      objectStore: fakeObjectStore({ [`kb/${DOC_ID}/vpn.txt`]: bytes }),
      vectorStore,
    }, passthroughStepRunner, { documentId: DOC_ID, generation: 1 });

    expect(result).toEqual({ outcome: 'noop', reason: 'missing_or_superseded' });
    expect(await repo.findById(DOC_ID)).toMatchObject({
      status: 'pending',
      ingestionGeneration: 2,
    });
    expect(vectorStore.upserts).toHaveLength(0);
  });

  it('marks failed without secrets after upsert retries are exhausted', async () => {
    const bytes = new TextEncoder().encode('needs indexing');
    const repo = memoryDocumentsRepo([
      seedRow({ byteSize: bytes.byteLength }),
    ]);
    const vectorStore = fakeVectorStore();
    vectorStore.upsertChunks = async () => {
      throw new Error('Pinecone unauthorized sk-openai_secret_value');
    };

    await expect(runIngestPipeline({
      repo,
      objectStore: fakeObjectStore({ [`kb/${DOC_ID}/vpn.txt`]: bytes }),
      vectorStore,
    }, passthroughStepRunner, { documentId: DOC_ID, generation: 1 })).rejects.toThrow(/unauthorized/i);

    const summary = await markIngestFailed(
      { repo },
      { documentId: DOC_ID, generation: 1 },
      new Error('OpenAI unauthorized sk-openai_secret_value'),
    );

    expect(summary).not.toContain('sk-openai_secret_value');
    expect(await repo.findById(DOC_ID)).toMatchObject({
      status: 'failed',
      errorSummary: summary,
    });
  });
});
