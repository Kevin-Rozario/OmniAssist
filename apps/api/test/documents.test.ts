import type { VectorStore } from '@omni/rag-core';
import type { ObjectStore } from '../src/lib/object-store';
import type { DocumentUploadedPayload } from '../src/modules/documents/events';
import { DocumentDetailSchema, ProblemDetailsSchema } from '@omni/types';
import { describe, expect, it } from 'vitest';
import { problemType } from '../src/lib/errors';
import { memoryDocumentsRepo } from '../src/modules/documents/repo';
import { createDocumentsService } from '../src/modules/documents/service';
import { buildTestApp, fakeVerifier } from './harness';

const DOC_ID = '019a1b2c-3d4e-7f80-9abc-def012345678';
const MAX_BYTES = 1_024;

const sessions = {
  'member-token': { userId: 'user_member', role: 'member' as const },
  'admin-token': { userId: 'user_admin', role: 'admin' as const },
};

function fakeObjectStore(): ObjectStore & { objects: Map<string, { body: Uint8Array; contentType: string }> } {
  const objects = new Map<string, { body: Uint8Array; contentType: string }>();
  return {
    objects,
    async put(key, body, contentType) {
      objects.set(key, { body, contentType });
    },
    async get(key) {
      const entry = objects.get(key);
      if (!entry)
        throw new Error(`missing ${key}`);
      return entry.body;
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

function buildDocumentsApp(options?: { createId?: () => string }) {
  const objectStore = fakeObjectStore();
  const vectorStore = fakeVectorStore();
  const uploaded: DocumentUploadedPayload[] = [];
  const service = createDocumentsService({
    repo: memoryDocumentsRepo(),
    objectStore,
    vectorStore,
    events: {
      emitUploaded: async (payload) => {
        uploaded.push(payload);
      },
    },
    maxUploadBytes: MAX_BYTES,
    createId: options?.createId ?? (() => DOC_ID),
  });

  const { app } = buildTestApp({
    verifier: fakeVerifier(sessions),
    documentsService: service,
  });

  return {
    app,
    objectStore,
    vectorStore,
    uploaded,
  };
}

async function readProblem(res: Response) {
  expect(res.headers.get('Content-Type')).toBe('application/problem+json');
  return ProblemDetailsSchema.parse(await res.json());
}

function markdownForm(name = 'vpn.md', contents = '# VPN') {
  const form = new FormData();
  form.append('file', new File([contents], name, { type: 'text/markdown' }));
  return form;
}

describe('/v1/documents', () => {
  it('allows an admin to upload and list documents', async () => {
    const { app, uploaded } = buildDocumentsApp();

    const created = await app.request('/v1/documents', {
      method: 'POST',
      headers: { Authorization: 'Bearer admin-token' },
      body: markdownForm(),
    });
    expect(created.status).toBe(201);
    const detail = DocumentDetailSchema.parse(await created.json());
    expect(detail).toMatchObject({
      id: DOC_ID,
      filename: 'vpn.md',
      status: 'pending',
      uploadedBy: 'user_admin',
    });
    expect(uploaded).toEqual([
      { documentId: DOC_ID, generation: 1 },
    ]);

    const listed = await app.request('/v1/documents', {
      headers: { Authorization: 'Bearer admin-token' },
    });
    expect(listed.status).toBe(200);
    expect(await listed.json()).toEqual({
      documents: [
        expect.objectContaining({ id: DOC_ID, filename: 'vpn.md', status: 'pending' }),
      ],
    });
  });

  it('returns 403 for a member and 401 when unauthenticated', async () => {
    const { app } = buildDocumentsApp();

    const member = await app.request('/v1/documents', {
      headers: { Authorization: 'Bearer member-token' },
    });
    expect(member.status).toBe(403);
    expect(await readProblem(member)).toMatchObject({ type: problemType.forbidden, status: 403 });

    const anon = await app.request('/v1/documents');
    expect(anon.status).toBe(401);
    expect(await readProblem(anon)).toMatchObject({ type: problemType.unauthenticated, status: 401 });
  });

  it('rejects unsupported formats and oversized files before storage', async () => {
    const { app, objectStore } = buildDocumentsApp();

    const unsupported = await app.request('/v1/documents', {
      method: 'POST',
      headers: { Authorization: 'Bearer admin-token' },
      body: (() => {
        const form = new FormData();
        form.append('file', new File(['a,b'], 'sheet.xlsx', {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }));
        return form;
      })(),
    });
    expect(unsupported.status).toBe(400);
    expect(await readProblem(unsupported)).toMatchObject({
      type: problemType.badRequest,
      reason: 'unsupported_format',
    });
    expect(objectStore.objects.size).toBe(0);

    const oversized = await app.request('/v1/documents', {
      method: 'POST',
      headers: { Authorization: 'Bearer admin-token' },
      body: (() => {
        const form = new FormData();
        form.append('file', new File([
          'x'.repeat(MAX_BYTES + 1),
        ], 'big.md', { type: 'text/markdown' }));
        return form;
      })(),
    });
    expect(oversized.status).toBe(400);
    expect(await readProblem(oversized)).toMatchObject({
      type: problemType.badRequest,
      reason: 'oversized',
      maxBytes: MAX_BYTES,
    });
    expect(objectStore.objects.size).toBe(0);
  });

  it('gets, reingests and deletes a document', async () => {
    const { app, objectStore, vectorStore, uploaded } = buildDocumentsApp();

    await app.request('/v1/documents', {
      method: 'POST',
      headers: { Authorization: 'Bearer admin-token' },
      body: markdownForm(),
    });

    const got = await app.request(`/v1/documents/${DOC_ID}`, {
      headers: { Authorization: 'Bearer admin-token' },
    });
    expect(got.status).toBe(200);
    expect(DocumentDetailSchema.parse(await got.json()).id).toBe(DOC_ID);

    uploaded.length = 0;
    const reingest = await app.request(`/v1/documents/${DOC_ID}/reingest`, {
      method: 'POST',
      headers: { Authorization: 'Bearer admin-token' },
    });
    expect(reingest.status).toBe(200);
    expect(DocumentDetailSchema.parse(await reingest.json()).status).toBe('pending');
    expect(uploaded).toEqual([
      { documentId: DOC_ID, generation: 2 },
    ]);

    const deleted = await app.request(`/v1/documents/${DOC_ID}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer admin-token' },
    });
    expect(deleted.status).toBe(204);
    expect(vectorStore.deleted).toEqual([DOC_ID]);
    expect(objectStore.objects.size).toBe(0);

    const missing = await app.request(`/v1/documents/${DOC_ID}`, {
      headers: { Authorization: 'Bearer admin-token' },
    });
    expect(missing.status).toBe(404);
  });

  it('documents OpenAPI paths for the documents module', async () => {
    const { app } = buildDocumentsApp();
    const doc = await (await app.request('/openapi.json')).json() as { paths: Record<string, unknown> };

    expect(Object.keys(doc.paths)).toEqual(expect.arrayContaining([
      '/v1/documents',
      '/v1/documents/{id}',
      '/v1/documents/{id}/reingest',
    ]));
    expect(doc.paths['/v1/documents']).toEqual(expect.objectContaining({
      get: expect.any(Object),
      post: expect.any(Object),
    }));
    expect(doc.paths['/v1/documents/{id}']).toEqual(expect.objectContaining({
      get: expect.any(Object),
      delete: expect.any(Object),
    }));
  });
});
