import type { Context } from 'hono';
import type { OmniInngest } from './client';
import type { IngestPipelineDeps } from './pipeline';
import { serve } from 'inngest/hono';
import { createIngestDocumentFunction } from './functions';

export type InngestHttpHandler = (c: Context) => Promise<Response>;

export function createInngestHandler(
  inngest: OmniInngest,
  deps: IngestPipelineDeps,
): InngestHttpHandler {
  return serve({
    client: inngest,
    functions: [
      createIngestDocumentFunction(inngest, deps),
    ],
  });
}
