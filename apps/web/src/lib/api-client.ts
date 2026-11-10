import type { AppType } from '@omni/api/app';
import type {
  DocumentDetail,
  DocumentListResponse,
  MeResponse,
  ProblemDetails,
} from '@omni/types';
import {
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
  const response = await client.v1.me.$get();
  return MeResponseSchema.parse(await response.json());
}

export async function listDocuments(getToken: GetToken): Promise<DocumentListResponse> {
  const client = createApiClient(getToken);
  const response = await client.v1.documents.$get();
  return DocumentListResponseSchema.parse(await response.json());
}

export async function uploadDocument(
  getToken: GetToken,
  file: File,
): Promise<DocumentDetail> {
  const client = createApiClient(getToken);
  const response = await client.v1.documents.$post({
    form: { file },
  });
  return DocumentDetailSchema.parse(await response.json());
}

export async function deleteDocument(getToken: GetToken, id: string): Promise<void> {
  const client = createApiClient(getToken);
  await client.v1.documents[':id'].$delete({
    param: { id },
  });
}

export async function reingestDocument(
  getToken: GetToken,
  id: string,
): Promise<DocumentDetail> {
  const client = createApiClient(getToken);
  const response = await client.v1.documents[':id'].reingest.$post({
    param: { id },
  });
  return DocumentDetailSchema.parse(await response.json());
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
