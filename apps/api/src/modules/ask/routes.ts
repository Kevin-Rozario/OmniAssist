import type { AskEvent } from '@omni/rag-graph';
import type { AskService } from './service';
import { createRoute, z } from '@hono/zod-openapi';
import { AskRequestSchema } from '@omni/types';
import { HTTPException } from 'hono/http-exception';
import { streamSSE } from 'hono/streaming';
import { currentSession } from '../../lib/auth';
import { problemType } from '../../lib/errors';
import { createRouter, problemResponses } from '../../lib/openapi';

const EVENT_STREAM_DESCRIPTION = [
  'A `text/event-stream` of server-sent events. Each frame has an `event` name and a JSON `data` payload.',
  'The stream always ends after `done` or `error`.',
  '',
  '| Event | Payload |',
  '| --- | --- |',
  '| `status` | `{ "stage": "routing" \\| "searching_kb" \\| "grading" \\| "searching_web" \\| "writing" }` |',
  '| `citations` | `{ "sources": [{ "n", "kind": "kb", "documentId", "filename" } \\| { "n", "kind": "web", "title", "url" }] }`, sent once before the first `token`, only for cited answers |',
  '| `token` | `{ "text" }`, an increment of the answer. Joining every `text` in order gives the full answer |',
  '| `done` | `{ "answerSource": "kb" \\| "web" \\| "fallback" \\| "direct", "sourceConfidence": "high" \\| "medium" \\| "low" \\| "not_applicable", "conversationId" }`, sent only after the exchange is saved |',
  '| `error` | `{ "type", "title", "requestId" }`, a sanitized failure after the stream started, including a failure to save. No `done` follows |',
].join('\n');

const askRoute = createRoute({
  method: 'post',
  path: '/ask',
  tags: ['Ask'],
  summary: 'Ask a question',
  description: 'Answers one question, streaming progress, citations and answer text. Send `conversationId` to continue one of your conversations (the six most recent exchanges are used as context); omit it to start a new one. A completed answer is saved and `done` reports the `conversationId`. An unknown or foreign id responds 404 and a full conversation (100 exchanges) responds 409, both before any stream starts.',
  security: [
    { bearerAuth: [] },
  ],
  request: {
    body: {
      content: {
        'application/json': { schema: AskRequestSchema },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: EVENT_STREAM_DESCRIPTION,
      content: {
        'text/event-stream': {
          schema: z.string(),
        },
      },
    },
    ...problemResponses(400, 401, 404, 409, 500),
  },
});

/** The SSE `data` for an event: its payload without the internal discriminator. */
function payloadOf(event: AskEvent): unknown {
  if (event.type === 'error')
    return event.error;
  const { type: _type, ...payload } = event;
  return payload;
}

export function askRoutes(service: AskService) {
  const router = createRouter();

  // A body that is not JSON is a plain 400, the same as malformed JSON, not a 415.
  router.use('/ask', async (c, next) => {
    if (c.req.method === 'POST' && !c.req.header('Content-Type')?.toLowerCase().includes('json'))
      throw new HTTPException(400, { message: 'The request body must be JSON with a "question" text.' });
    await next();
  });

  return router.openapi(askRoute, async (c) => {
    const { question, conversationId } = c.req.valid('json');
    const { userId } = currentSession(c);
    const logger = c.var.logger;
    const requestId = c.var.requestId;

    // Ownership and size are settled before the stream opens, so a refusal is a plain problem+json.
    const conversation = await service.begin(userId, conversationId);

    // Tells reverse proxies not to buffer, so tokens reach the client as they are produced.
    c.header('X-Accel-Buffering', 'no');
    return streamSSE(c, async (stream) => {
      const cancelled = new AbortController();
      stream.onAbort(() => cancelled.abort());
      const signal = AbortSignal.any([c.req.raw.signal, cancelled.signal]);

      try {
        for await (const event of service.ask(question, {
          userId,
          conversation,
          signal,
          logger,
          requestId,
        })) {
          if (signal.aborted)
            break;
          await stream.writeSSE({
            event: event.type,
            data: JSON.stringify(payloadOf(event)),
          });
        }
      }
      catch (error) {
        // The service reports its own failures as events; this guards against it throwing.
        if (signal.aborted)
          return;
        logger.error({ err: error }, 'ask stream failed');
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({
            type: problemType.internal,
            title: 'Internal server error',
            requestId,
          }),
        });
      }
    }) as never;
  });
}
