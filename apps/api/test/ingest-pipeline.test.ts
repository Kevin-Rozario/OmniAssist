import type { EmbeddingClient, VectorStore } from '@omni/rag-core';
import type { ObjectStore } from '../src/lib/object-store';
import type { KbDocumentRow } from '../src/modules/documents/repo';
import { describe, expect, it, vi } from 'vitest';
import { memoryDocumentsRepo } from '../src/modules/documents/repo';
import {
  markIngestFailed,
  passthroughStepRunner,
  runIngestPipeline,
} from '../src/modules/inngest/pipeline';
import { sanitizeErrorSummary } from '../src/modules/inngest/sanitize';

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

function fakeObjectStore(initial: Record<string, Uint8Array> = {}): ObjectStore {
  const objects = new Map(Object.entries(initial).map(([key, body]) => [
    key,
    body,
  ]));
  return {
    async put(key, body) {
      objects.set(key, body);
    },
    async get(key) {
      const body = objects.get(key);
      if (!body)
        throw new Error(`missing object ${key}`);
      return body;
    },
    async delete(key) {
      objects.delete(key);
    },
  };
}

function fakeEmbeddings(impl?: EmbeddingClient['embed']): EmbeddingClient {
  return {
    embed: impl ?? (async texts => texts.map((_, index) => [
      index + 0.1,
      index + 0.2,
    ])),
  };
}

function fakeVectorStore(): VectorStore & { upserts: unknown[]; deleted: string[] } {
  const upserts: unknown[] = [];
  const deleted: string[] = [];
  return {
    upserts,
    deleted,
    async upsertChunks(chunks) {
      upserts.push(chunks);
    },
    async deleteByDocumentId(documentId) {
      deleted.push(documentId);
    },
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
  it('marks a clean text document ready and upserts vectors', async () => {
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
      embeddings: fakeEmbeddings(),
      vectorStore,
    }, step, { documentId: DOC_ID, generation: 1 });

    expect(steps).toEqual([
      'mark-processing',
      'parse-and-chunk',
      'embed-and-upsert',
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
      embeddings: fakeEmbeddings(),
      vectorStore: fakeVectorStore(),
    }, passthroughStepRunner, { documentId: DOC_ID, generation: 1 });

    expect(result).toEqual({ outcome: 'failed', errorSummary: 'No extractable text' });
    expect(await repo.findById(DOC_ID)).toMatchObject({
      status: 'failed',
      errorSummary: 'No extractable text',
    });
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
      embeddings: fakeEmbeddings(),
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
      embeddings: fakeEmbeddings(),
      vectorStore,
    }, passthroughStepRunner, { documentId: DOC_ID, generation: 1 });

    expect(result).toEqual({ outcome: 'noop', reason: 'missing_or_superseded' });
    expect(await repo.findById(DOC_ID)).toMatchObject({
      status: 'pending',
      ingestionGeneration: 2,
    });
    expect(vectorStore.upserts).toHaveLength(0);
  });

  it('marks failed without secrets after embed retries are exhausted', async () => {
    const bytes = new TextEncoder().encode('needs embeddings');
    const repo = memoryDocumentsRepo([
      seedRow({ byteSize: bytes.byteLength }),
    ]);
    const embed = vi.fn(async () => {
      throw new Error('OpenAI unauthorized sk-openai_secret_value');
    });

    await expect(runIngestPipeline({
      repo,
      objectStore: fakeObjectStore({ [`kb/${DOC_ID}/vpn.txt`]: bytes }),
      embeddings: fakeEmbeddings(embed),
      vectorStore: fakeVectorStore(),
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
