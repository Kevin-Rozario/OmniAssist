import type { OmniInngest } from './client';
import type { IngestPipelineDeps } from './pipeline';
import { DOCUMENT_UPLOADED_EVENT } from '../documents/events';
import { markIngestFailed, runIngestPipeline } from './pipeline';

export const INGEST_DOCUMENT_FUNCTION_ID = 'kb-ingest-document' as const;

export function createIngestDocumentFunction(
  inngest: OmniInngest,
  deps: IngestPipelineDeps,
) {
  return inngest.createFunction(
    {
      id: INGEST_DOCUMENT_FUNCTION_ID,
      name: 'Ingest knowledge-base document',
      triggers: [
        { event: DOCUMENT_UPLOADED_EVENT },
      ],
      retries: 3,
      // One run per document so a newer generation cannot upsert while an older
      // run is still writing. The older run finishes, including its cleanup delete.
      concurrency: {
        limit: 1,
        key: 'event.data.documentId',
      },
      onFailure: async ({ event, error }) => {
        const original = event.data.event;
        const data = original?.data as { documentId?: string; generation?: number } | undefined;
        if (!data?.documentId || typeof data.generation !== 'number')
          return;
        await markIngestFailed(deps, {
          documentId: data.documentId,
          generation: data.generation,
        }, error);
      },
    },
    async ({ event, step }) => {
      const data = event.data as { documentId: string; generation: number };
      // Adapt Inngest's JSON-serialized step.run into the pipeline's runner shape.
      return runIngestPipeline(deps, {
        run: async <T>(id: string, fn: () => Promise<T>): Promise<T> =>
          await step.run(id, fn) as T,
      }, {
        documentId: data.documentId,
        generation: data.generation,
      });
    },
  );
}
