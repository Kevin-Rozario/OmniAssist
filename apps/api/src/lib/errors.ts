import type { ProblemDetails, ValidationIssue } from '@omni/types';
import type { Context, ErrorHandler, NotFoundHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ZodError } from 'zod';
import type { AppEnv } from './context';
import { HTTPException } from 'hono/http-exception';

export const PROBLEM_BASE_URI = 'https://omni-it-copilot.dev/problems';
export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

export const problemType = {
  badRequest: `${PROBLEM_BASE_URI}/bad-request`,
  validation: `${PROBLEM_BASE_URI}/validation`,
  unauthenticated: `${PROBLEM_BASE_URI}/unauthenticated`,
  forbidden: `${PROBLEM_BASE_URI}/forbidden`,
  notFound: `${PROBLEM_BASE_URI}/not-found`,
  conflict: `${PROBLEM_BASE_URI}/conflict`,
  internal: `${PROBLEM_BASE_URI}/internal`,
  upstream: `${PROBLEM_BASE_URI}/upstream`,
  serviceUnavailable: `${PROBLEM_BASE_URI}/service-unavailable`,
} as const;

export abstract class AppError extends Error {
  abstract readonly status: ContentfulStatusCode;
  abstract readonly type: string;
  abstract readonly title: string;
  readonly detail?: string;

  constructor(detail?: string, options?: ErrorOptions) {
    super(detail, options);
    this.name = new.target.name;
    this.detail = detail;
  }

  extensions(): Record<string, unknown> {
    return {};
  }
}

export class ValidationError extends AppError {
  readonly status = 400;
  readonly type = problemType.validation;
  readonly title = 'Validation failed';

  constructor(readonly errors: ValidationIssue[], detail = 'The request did not match the expected schema.') {
    super(detail);
  }

  static fromZod(error: ZodError): ValidationError {
    return new ValidationError(
      error.issues.map(issue => ({ path: issue.path.map(String).join('.') || '(root)', message: issue.message })),
    );
  }

  override extensions(): Record<string, unknown> {
    return { errors: this.errors };
  }
}

export class UnauthenticatedError extends AppError {
  readonly status = 401;
  readonly type = problemType.unauthenticated;
  readonly title = 'Authentication required';

  constructor(detail = 'A valid session token is required.') {
    super(detail);
  }
}

export class ForbiddenError extends AppError {
  readonly status = 403;
  readonly type = problemType.forbidden;
  readonly title = 'Forbidden';

  constructor(detail = 'You do not have permission to perform this action.') {
    super(detail);
  }
}

export class NotFoundError extends AppError {
  readonly status = 404;
  readonly type = problemType.notFound;
  readonly title = 'Not found';
}

export class ConflictError extends AppError {
  readonly status = 409;
  readonly type = problemType.conflict;
  readonly title = 'Conflict';
}

export class UpstreamError extends AppError {
  readonly status = 502;
  readonly type = problemType.upstream;
  readonly title = 'Upstream service failed';
}

export class ServiceUnavailableError extends AppError {
  readonly status = 503;
  readonly type = problemType.serviceUnavailable;
  readonly title = 'Service unavailable';
}

const typeByStatus: Partial<Record<number, string>> = {
  400: problemType.badRequest,
  401: problemType.unauthenticated,
  403: problemType.forbidden,
  404: problemType.notFound,
  409: problemType.conflict,
  502: problemType.upstream,
  503: problemType.serviceUnavailable,
};

const titleByStatus: Partial<Record<number, string>> = {
  400: 'Bad request',
  401: 'Authentication required',
  403: 'Forbidden',
  404: 'Not found',
  405: 'Method not allowed',
  409: 'Conflict',
  413: 'Payload too large',
  415: 'Unsupported media type',
  429: 'Too many requests',
  502: 'Upstream service failed',
  503: 'Service unavailable',
};

interface ProblemInit {
  type: string;
  title: string;
  detail?: string;
  [extension: string]: unknown;
}

export function problemResponse(c: Context<AppEnv>, status: ContentfulStatusCode, problem: ProblemInit): Response {
  const body: ProblemDetails = { ...problem, status, requestId: c.var.requestId };
  return c.body(JSON.stringify(body), status, { 'Content-Type': PROBLEM_CONTENT_TYPE });
}

export const onError: ErrorHandler<AppEnv> = (error, c) => {
  if (error instanceof AppError) {
    if (error.status >= 500)
      c.var.logger.error({ err: error }, error.message);
    return problemResponse(c, error.status, {
      type: error.type,
      title: error.title,
      ...(error.detail
        ? { detail: error.detail }
        : {}),
      ...error.extensions(),
    });
  }

  if (error instanceof HTTPException) {
    const status = error.status as ContentfulStatusCode;
    if (status >= 500)
      c.var.logger.error({ err: error }, error.message);
    return problemResponse(c, status, {
      type: typeByStatus[status] ?? 'about:blank',
      title: titleByStatus[status] ?? 'Request failed',
      ...(status < 500 && error.message
        ? { detail: error.message }
        : {}),
    });
  }

  c.var.logger.error({ err: error }, 'unhandled error');
  return problemResponse(c, 500, {
    type: problemType.internal,
    title: 'Internal server error',
    detail: 'An unexpected error occurred. Quote the request ID when reporting this problem.',
  });
};

export const notFound: NotFoundHandler<AppEnv> = c =>
  problemResponse(c, 404, {
    type: problemType.notFound,
    title: 'Not found',
    detail: `No route matches ${c.req.method} ${c.req.path}.`,
  });
