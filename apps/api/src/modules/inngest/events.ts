import type { DocumentEvents, DocumentUploadedPayload } from '../documents/events';
import type { OmniInngest } from './client';
import { UpstreamError } from '../../lib/errors';
import { DOCUMENT_UPLOADED_EVENT } from '../documents/events';

export function inngestDocumentEvents(inngest: OmniInngest): DocumentEvents {
  return {
    async emitUploaded(payload: DocumentUploadedPayload) {
      try {
        await inngest.send({
          name: DOCUMENT_UPLOADED_EVENT,
          data: payload,
        });
      }
      catch (error) {
        throw new UpstreamError('Could not enqueue document ingestion.', { cause: error });
      }
    },
  };
}
