import type { VectorStore } from '@omni/rag-core';
import type { ObjectStore } from '../src/lib/object-store';
import type { DocumentUploadedPayload } from '../src/modules/documents/events';
import { describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '../src/lib/errors';
import { memoryDocumentsRepo } from '../src/modules/documents/repo';
import { createDocumentsService } from '../src/modules/documents/service';

const DOC_ID = '019a1b2c-3d4e-7f80-9abc-def012345678';

function fakeObjectStore(): ObjectStore & { objects: Map<string, Uint8Array> } {
  const objects = new Map<string, Uint8Array>();
  return {
    objects,
    async put(key, body) {
      objects.set(key, body);
    },
    async get(key) {
      const body = objects.get(key);
      if (!body)
        throw new Error(`missing ${key}`);
      return body;
    },
    async delete(key) {
      objects.delete(key);
    },
  };
}

function fakeVectorStore(): VectorStore & { deleted: string[] } {
  const deleted: string[] = [];
  return {
    deleted,
    async upsertChunks() {},
    async deleteByDocumentId(documentId) {
      deleted.push(documentId);
    },
  };
}

function recordingEvents() {
  const uploaded: DocumentUploadedPayload[] = [];
  return {
    uploaded,
    events: {
      emitUploaded: async (payload: DocumentUploadedPayload) => {
        uploaded.push(payload);
      },
    },
  };
}

describe('createDocumentsService', () => {
  it('creates a pending document after putting the object', async () => {
    const objectStore = fakeObjectStore();
    const vectorStore = fakeVectorStore();
    const { events, uploaded } = recordingEvents();
    const service = createDocumentsService({
      repo: memoryDocumentsRepo(),
      objectStore,
      vectorStore,
      events,
      maxUploadBytes: 10_000,
      createId: () => DOC_ID,
    });

    const bytes = new TextEncoder().encode('# VPN\n\nConnect with WireGuard.');
    const detail = await service.create({
      filename: 'vpn-guide.md',
      bytes,
      uploadedBy: 'user_admin',
      declaredContentType: 'text/markdown',
    });

    expect(detail).toMatchObject({
      id: DOC_ID,
      filename: 'vpn-guide.md',
      contentType: 'text/markdown',
      byteSize: bytes.byteLength,
      status: 'pending',
      uploadedBy: 'user_admin',
      chunkCount: null,
      errorSummary: null,
    });
    expect(detail.contentHash).toHaveLength(64);
    expect(objectStore.objects.has(`kb/${DOC_ID}/vpn-guide.md`)).toBe(true);
    expect(uploaded).toEqual([
      { documentId: DOC_ID, generation: 1 },
    ]);
  });

  it('returns 404 semantics for a missing document', async () => {
    const service = createDocumentsService({
      repo: memoryDocumentsRepo(),
      objectStore: fakeObjectStore(),
      vectorStore: fakeVectorStore(),
      events: recordingEvents().events,
      maxUploadBytes: 10_000,
    });

    await expect(service.get('019a1b2c-3d4e-7f80-9abc-def012345679')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('delete bumps generation then removes vectors and the object', async () => {
    const objectStore = fakeObjectStore();
    const vectorStore = fakeVectorStore();
    const bump = vi.fn();
    const repo = memoryDocumentsRepo();
    const originalBump = repo.bumpGeneration.bind(repo);
    repo.bumpGeneration = async (id) => {
      bump(id);
      return originalBump(id);
    };

    const service = createDocumentsService({
      repo,
      objectStore,
      vectorStore,
      events: recordingEvents().events,
      maxUploadBytes: 10_000,
      createId: () => DOC_ID,
    });

    await service.create({
      filename: 'note.txt',
      bytes: new TextEncoder().encode('hello'),
      uploadedBy: 'user_admin',
    });

    await service.delete(DOC_ID);

    expect(bump).toHaveBeenCalledWith(DOC_ID);
    expect(vectorStore.deleted).toEqual([DOC_ID]);
    expect(objectStore.objects.size).toBe(0);
    await expect(service.get(DOC_ID)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('reingest increments generation and emits the uploaded event', async () => {
    const { events, uploaded } = recordingEvents();
    const service = createDocumentsService({
      repo: memoryDocumentsRepo(),
      objectStore: fakeObjectStore(),
      vectorStore: fakeVectorStore(),
      events,
      maxUploadBytes: 10_000,
      createId: () => DOC_ID,
    });

    await service.create({
      filename: 'policy.md',
      bytes: new TextEncoder().encode('# Policy'),
      uploadedBy: 'user_admin',
    });
    uploaded.length = 0;

    const detail = await service.reingest(DOC_ID);
    expect(detail.status).toBe('pending');
    expect(uploaded).toEqual([
      { documentId: DOC_ID, generation: 2 },
    ]);

    const again = await service.reingest(DOC_ID);
    expect(uploaded).toEqual([
      { documentId: DOC_ID, generation: 2 },
      { documentId: DOC_ID, generation: 3 },
    ]);
    expect(again).toMatchObject({ id: DOC_ID, status: 'pending' });
  });
});
