export const DOCUMENT_UPLOADED_EVENT = 'kb/document.uploaded' as const;

export interface DocumentUploadedPayload {
  documentId: string;
  generation: number;
}

/**
 * Emits ingestion-trigger events. Production will use Inngest (section 6);
 * tests inject a fake recorder.
 */
export interface DocumentEvents {
  emitUploaded: (payload: DocumentUploadedPayload) => Promise<void>;
}

export function noopDocumentEvents(): DocumentEvents {
  return {
    async emitUploaded() {},
  };
}
