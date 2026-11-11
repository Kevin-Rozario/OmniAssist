import type { GenerateRequest, Generator } from '../ports';

interface ChatChunk {
  choices: Array<{ delta?: { content?: string | null } }>;
}

/** A streamed response whose underlying request can be cancelled, like the SDK's `Stream`. */
export type ChatStream = AsyncIterable<ChatChunk> & { controller: AbortController };

/** The part of the `OpenAI` client the adapter uses, so tests can supply a fake. */
export interface OpenAiChatClient {
  chat: {
    completions: {
      create: (
        body: {
          model: string;
          messages: Array<{ role: 'system' | 'user'; content: string }>;
          stream: true;
        },
        options?: { signal?: AbortSignal },
      ) => PromiseLike<ChatStream>;
    };
  };
}

export interface OpenAiGeneratorOptions {
  client: OpenAiChatClient;
  /** Answer model id. Required: there is no default, so a stale id cannot ship silently. */
  model: string;
}

export function createOpenAiGenerator(options: OpenAiGeneratorOptions): Generator {
  const { client, model } = options;

  return {
    stream(request: GenerateRequest): AsyncIterable<string> {
      return streamText(client, model, request);
    },
  };
}

async function* streamText(
  client: OpenAiChatClient,
  model: string,
  request: GenerateRequest,
): AsyncGenerator<string> {
  const { signal } = request;
  signal?.throwIfAborted();

  const stream = await client.chat.completions.create(
    {
      model,
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.user },
      ],
      stream: true,
    },
    { signal },
  );

  const cancel = () => stream.controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });

  let finished = false;
  try {
    for await (const chunk of stream) {
      signal?.throwIfAborted();
      const text = chunk.choices[0]?.delta?.content;
      if (text)
        yield text;
    }
    finished = true;
  }
  finally {
    signal?.removeEventListener('abort', cancel);
    // Leaving early, by abort, error or the consumer stopping, must not leave the request open.
    if (!finished)
      stream.controller.abort();
  }
}
