export const DOCUMENT_UPLOADED_EVENT = 'kb/document.uploaded' as const;

export interface DocumentUploadedPayload {
  documentId: string;
  generation: number;
}

/** Emits ingestion-trigger events. Production uses Inngest; tests inject a fake recorder. */
export interface DocumentEvents {
  emitUploaded: (payload: DocumentUploadedPayload) => Promise<void>;
}
