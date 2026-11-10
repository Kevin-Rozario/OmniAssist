import type { DOCUMENT_UPLOADED_EVENT } from '../documents/events';
import { Inngest } from 'inngest';

export interface InngestEvents {
  [DOCUMENT_UPLOADED_EVENT]: {
    data: {
      documentId: string;
      generation: number;
    };
  };
}

export interface CreateInngestClientOptions {
  appId?: string;
  eventKey: string;
  signingKey?: string;
}

export function createInngestClient(options: CreateInngestClientOptions) {
  return new Inngest({
    id: options.appId ?? 'omniassist-api',
    eventKey: options.eventKey,
    ...(options.signingKey
      ? { signingKey: options.signingKey }
      : {}),
  });
}

export type OmniInngest = ReturnType<typeof createInngestClient>;
