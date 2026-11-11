import type { AppEnv } from './context';
import { OpenAPIHono } from '@hono/zod-openapi';
import { ProblemDetailsSchema } from '@omni/types';
import { PROBLEM_CONTENT_TYPE, ValidationError } from './errors';

export function createRouter(): OpenAPIHono<AppEnv> {
  return new OpenAPIHono<AppEnv>({
    defaultHook: (result) => {
      if (!result.success)
        throw ValidationError.fromZod(result.error);
    },
  });
}

const ProblemSchema = ProblemDetailsSchema.meta({ id: 'ProblemDetails' });

const problemDescriptions = {
  400: 'The request is invalid.',
  401: 'The session token is missing or invalid.',
  403: 'The caller lacks the required role.',
  404: 'The resource does not exist.',
  409: 'The request conflicts with the current state of the resource.',
  413: 'The request body is too large.',
  500: 'An unexpected error occurred.',
  502: 'An upstream service failed.',
  503: 'A required dependency is unavailable.',
} as const;

type ProblemStatus = keyof typeof problemDescriptions;

interface ProblemResponse {
  description: string;
  content: { [PROBLEM_CONTENT_TYPE]: { schema: typeof ProblemSchema } };
}

export function problemResponses<const S extends ProblemStatus>(...statuses: S[]): Record<S, ProblemResponse> {
  const responses = {} as Record<S, ProblemResponse>;
  for (const status of statuses) {
    responses[status] = {
      description: problemDescriptions[status],
      content: {
        [PROBLEM_CONTENT_TYPE]: { schema: ProblemSchema },
      },
    };
  }
  return responses;
}
