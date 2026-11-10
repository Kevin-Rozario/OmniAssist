import type { DocumentEvents, DocumentUploadedPayload } from '../documents/events';
import type { OmniInngest } from './client';
import { DOCUMENT_UPLOADED_EVENT } from '../documents/events';

export function inngestDocumentEvents(inngest: OmniInngest): DocumentEvents {
  return {
    async emitUploaded(payload: DocumentUploadedPayload) {
      await inngest.send({
        name: DOCUMENT_UPLOADED_EVENT,
        data: payload,
      });
    },
  };
}
