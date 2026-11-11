import type { AppType } from '@omni/api/app';
import type {
  AskStreamEvent,
  ConversationDetail,
  ConversationListResponse,
  ConversationSummary,
  DocumentDetail,
  DocumentListResponse,
  MeResponse,
  ProblemDetails,
} from '@omni/types';
import {
  ConversationDetailSchema,
  ConversationListResponseSchema,
  ConversationSummarySchema,
  createAskStreamParser,
  DocumentDetailSchema,
  DocumentListResponseSchema,
  MeResponseSchema,
  ProblemDetailsSchema,
} from '@omni/types';
import { hc } from 'hono/client';
import { env } from '@/env';

export class ApiError extends Error {
  readonly problem: ProblemDetails;

  constructor(problem: ProblemDetails) {
    super(problem.title);
    this.name = 'ApiError';
    this.problem = problem;
  }
}

export type GetToken = () => Promise<string | null>;

export function createApiClient(getToken: GetToken) {
  return hc<AppType>(env.NEXT_PUBLIC_API_URL, {
    fetch: authenticatedFetch(getToken),
  });
}

export async function fetchMe(getToken: GetToken): Promise<MeResponse> {
  const client = createApiClient(getToken);
  const response = await client.api.v1.me.$get();
  return MeResponseSchema.parse(await response.json());
}

export async function listDocuments(getToken: GetToken): Promise<DocumentListResponse> {
  const client = createApiClient(getToken);
  const response = await client.api.v1.documents.$get();
  return DocumentListResponseSchema.parse(await response.json());
}

export async function uploadDocument(
  getToken: GetToken,
  file: File,
): Promise<DocumentDetail> {
  const client = createApiClient(getToken);
  const response = await client.api.v1.documents.$post({
    form: { file },
  });
  return DocumentDetailSchema.parse(await response.json());
}

export async function deleteDocument(getToken: GetToken, id: string): Promise<void> {
  const client = createApiClient(getToken);
  await client.api.v1.documents[':id'].$delete({
    param: { id },
  });
}

export async function reingestDocument(
  getToken: GetToken,
  id: string,
): Promise<DocumentDetail> {
  const client = createApiClient(getToken);
  const response = await client.api.v1.documents[':id'].reingest.$post({
    param: { id },
  });
  return DocumentDetailSchema.parse(await response.json());
}

export async function listConversations(getToken: GetToken): Promise<ConversationListResponse> {
  const client = createApiClient(getToken);
  const response = await client.api.v1.conversations.$get();
  return ConversationListResponseSchema.parse(await response.json());
}

export async function getConversation(getToken: GetToken, id: string): Promise<ConversationDetail> {
  const client = createApiClient(getToken);
  const response = await client.api.v1.conversations[':id'].$get({
    param: { id },
  });
  return ConversationDetailSchema.parse(await response.json());
}

export async function renameConversation(
  getToken: GetToken,
  id: string,
  title: string,
): Promise<ConversationSummary> {
  const client = createApiClient(getToken);
  const response = await client.api.v1.conversations[':id'].$patch({
    param: { id },
    json: { title },
  });
  return ConversationSummarySchema.parse(await response.json());
}

export async function deleteConversation(getToken: GetToken, id: string): Promise<void> {
  const client = createApiClient(getToken);
  await client.api.v1.conversations[':id'].$delete({
    param: { id },
  });
}

/** The ask stream broke: it was malformed, or it closed without a `done` or `error` event. */
export class AskStreamError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AskStreamError';
  }
}

/**
 * Ask one question, in a conversation when `conversationId` is given, and yield the validated stream events in order.
 *
 * A rejected request throws `ApiError` before the first event. A broken stream throws
 * `AskStreamError`. Aborting `signal` rejects with the platform's `AbortError`, unchanged.
 * The generator ends after the `done` or `error` event.
 */
export async function* askStream(
  getToken: GetToken,
  question: string,
  signal?: AbortSignal,
  /** Continue this conversation. Omit it to start a new one. */
  conversationId?: string,
): AsyncGenerator<AskStreamEvent, void, undefined> {
  const response = await authenticatedFetch(getToken)(
    `${env.NEXT_PUBLIC_API_URL.replace(/\/+$/, '')}/api/v1/ask`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
      body: JSON.stringify(conversationId
        ? { question, conversationId }
        : { question }),
      signal,
    },
  );
  if (!response.body)
    throw new AskStreamError('The answer stream had no body.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createAskStreamParser();

  function parse(read: () => AskStreamEvent[]): AskStreamEvent[] {
    try {
      return read();
    }
    catch (cause) {
      throw new AskStreamError('The answer stream was malformed.', { cause });
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      const events = parse(() => done
        ? parser.push(decoder.decode()).concat(parser.end())
        : parser.push(decoder.decode(value, { stream: true })));

      for (const event of events) {
        yield event;
        if (event.event === 'done' || event.event === 'error')
          return;
      }
      if (done)
        throw new AskStreamError('The answer stream ended before it completed.');
    }
  }
  finally {
    await reader.cancel().catch(() => {});
  }
}

function authenticatedFetch(getToken: GetToken): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    const token = await getToken();
    if (token)
      headers.set('Authorization', `Bearer ${token}`);
    if (!headers.has('X-Request-Id'))
      headers.set('X-Request-Id', globalThis.crypto.randomUUID());

    const response = await globalThis.fetch(input, { ...init, headers });
    if (!response.ok)
      throw await toApiError(response);
    return response;
  };
}

async function toApiError(response: Response): Promise<ApiError> {
  let payload: unknown;
  try {
    payload = await response.json();
  }
  catch {
    payload = null;
  }

  const parsed = ProblemDetailsSchema.safeParse(payload);
  if (parsed.success)
    return new ApiError(parsed.data);

  const status = response.status >= 400 && response.status <= 599
    ? response.status
    : 500;
  const fallback = ProblemDetailsSchema.parse({
    type: 'about:blank',
    title: response.statusText || 'Request failed',
    status,
    requestId: response.headers.get('X-Request-Id') || 'unknown',
  });
  return new ApiError(fallback);
}
