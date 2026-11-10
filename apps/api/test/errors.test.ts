import { createRoute, z } from '@hono/zod-openapi';
import { ProblemDetailsSchema } from '@omni/types';
import { describe, expect, it } from 'vitest';
import { NotFoundError, problemType } from '../src/lib/errors';
import { createRouter } from '../src/lib/openapi';
import { buildTestApp } from './harness';

const echoRoute = createRoute({
  method: 'post',
  path: '/__test/echo',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            name: z.string().min(1),
            tags: z.array(z.string()).max(2),
          }),
        },
      },
    },
  },
  responses: {
    200: { description: 'Echo' },
  },
});

function buildAppWithTestRoutes() {
  const harness = buildTestApp();
  const testRoutes = createRouter()
    .openapi(echoRoute, c => c.json(c.req.valid('json'), 200))
    .get('/__test/boom', () => {
      throw new Error('database password is hunter2');
    })
    .get('/__test/missing', () => {
      throw new NotFoundError('Thread 42 does not exist.');
    });
  harness.app.route('/', testRoutes);
  return harness;
}

async function readProblem(res: Response) {
  expect(res.headers.get('Content-Type')).toBe('application/problem+json');
  const text = await res.text();
  return {
    text,
    problem: ProblemDetailsSchema.parse(JSON.parse(text)),
  };
}

describe('problem details', () => {
  it('returns 404 for an unknown route', async () => {
    const { app } = buildTestApp();
    const res = await app.request('/does-not-exist', {
      headers: { 'X-Request-Id': 'nf-1' },
    });

    expect(res.status).toBe(404);
    const { problem } = await readProblem(res);
    expect(problem).toMatchObject({ type: problemType.notFound, status: 404, requestId: 'nf-1' });
  });

  it('returns 400 listing each invalid field path', async () => {
    const { app } = buildAppWithTestRoutes();
    const res = await app.request('/__test/echo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'val-1' },
      body: JSON.stringify({
        name: '',
        tags: ['a', 'b', 'c'],
      }),
    });

    expect(res.status).toBe(400);
    const { problem } = await readProblem(res);
    expect(problem).toMatchObject({ type: problemType.validation, status: 400, requestId: 'val-1' });
    expect(problem.errors?.map(error => error.path).sort()).toEqual(['name', 'tags']);
    expect(problem.errors?.every(error => error.message.length > 0)).toBe(true);
  });

  it('returns 400 for a malformed JSON body', async () => {
    const { app } = buildAppWithTestRoutes();
    const res = await app.request('/__test/echo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"name":',
    });

    expect(res.status).toBe(400);
    const { problem } = await readProblem(res);
    expect(problem.type).toBe(problemType.badRequest);
  });

  it('maps an AppError to its problem type and detail', async () => {
    const { app } = buildAppWithTestRoutes();
    const res = await app.request('/__test/missing');

    expect(res.status).toBe(404);
    const { problem } = await readProblem(res);
    expect(problem).toMatchObject({ type: problemType.notFound, detail: 'Thread 42 does not exist.' });
  });

  it('returns a generic 500 for a thrown plain Error and logs the original', async () => {
    const { app, log } = buildAppWithTestRoutes();
    const res = await app.request('/__test/boom', {
      headers: { 'X-Request-Id': 'boom-1' },
    });

    expect(res.status).toBe(500);
    const { text, problem } = await readProblem(res);
    expect(problem).toMatchObject({ type: problemType.internal, status: 500, requestId: 'boom-1' });
    expect(text).not.toContain('hunter2');
    expect(text).not.toMatch(/\bat\s.+:\d+:\d+/);

    const logged = log.entries().find(entry => entry.msg === 'unhandled error');
    expect(logged).toMatchObject({
      requestId: 'boom-1',
      err: { message: 'database password is hunter2' },
    });
    expect((logged?.err as { stack?: string }).stack).toBeTruthy();
  });
});
