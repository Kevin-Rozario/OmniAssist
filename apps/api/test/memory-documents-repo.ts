import type { DocumentsRepo, KbDocumentRow } from '../src/modules/documents/repo';

/** In-memory repo for unit tests. */
export function memoryDocumentsRepo(seed: KbDocumentRow[] = []): DocumentsRepo {
  const rows = new Map<string, KbDocumentRow>(seed.map(row => [
    row.id,
    { ...row },
  ]));

  function withGeneration(
    id: string,
    expectedGeneration: number,
    update: (row: KbDocumentRow) => KbDocumentRow,
  ): KbDocumentRow | null {
    const row = rows.get(id);
    if (!row || row.ingestionGeneration !== expectedGeneration)
      return null;
    const updated = update(row);
    rows.set(id, updated);
    return { ...updated };
  }

  return {
    async insert(input) {
      const now = new Date();
      const row: KbDocumentRow = {
        id: input.id,
        filename: input.filename,
        contentType: input.contentType,
        byteSize: input.byteSize,
        storageKey: input.storageKey,
        status: 'pending',
        errorSummary: null,
        chunkCount: null,
        contentHash: input.contentHash,
        ingestionGeneration: 1,
        uploadedBy: input.uploadedBy,
        createdAt: now,
        updatedAt: now,
      };
      rows.set(row.id, row);
      return { ...row };
    },

    async findById(id) {
      const row = rows.get(id);
      return row
        ? { ...row }
        : null;
    },

    async list() {
      return [
        ...rows.values(),
      ]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map(row => ({ ...row }));
    },

    async bumpGeneration(id) {
      const row = rows.get(id);
      if (!row)
        return null;
      const updated = {
        ...row,
        ingestionGeneration: row.ingestionGeneration + 1,
        updatedAt: new Date(),
      };
      rows.set(id, updated);
      return { ...updated };
    },

    async prepareReingest(id) {
      const row = rows.get(id);
      if (!row)
        return null;
      const updated: KbDocumentRow = {
        ...row,
        ingestionGeneration: row.ingestionGeneration + 1,
        status: 'pending',
        errorSummary: null,
        chunkCount: null,
        updatedAt: new Date(),
      };
      rows.set(id, updated);
      return { ...updated };
    },

    async delete(id) {
      rows.delete(id);
    },

    async markProcessing(id, expectedGeneration) {
      return withGeneration(id, expectedGeneration, row => ({
        ...row,
        status: 'processing',
        errorSummary: null,
        updatedAt: new Date(),
      }));
    },

    async markReady(id, expectedGeneration, chunkCount) {
      return withGeneration(id, expectedGeneration, row => ({
        ...row,
        status: 'ready',
        chunkCount,
        errorSummary: null,
        updatedAt: new Date(),
      }));
    },

    async markFailed(id, expectedGeneration, errorSummary) {
      return withGeneration(id, expectedGeneration, row => ({
        ...row,
        status: 'failed',
        errorSummary,
        chunkCount: null,
        updatedAt: new Date(),
      }));
    },
  };
}
