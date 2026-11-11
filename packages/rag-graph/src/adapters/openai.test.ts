import type { ChatStream, OpenAiChatClient } from './openai';
import OpenAI from 'openai';
import { describe, expect, it, vi } from 'vitest';
import { createOpenAiGenerator } from './openai';

function chunk(content: string | null | undefined) {
  return {
    choices: [
      {
        delta: { content },
      },
    ],
  };
}

/** A stream of `chunks` that stops, like the SDK's, when its controller aborts. */
function fakeStream(chunks: Array<ReturnType<typeof chunk>>, options: { hangAfter?: number } = {}) {
  const controller = new AbortController();
  const abort = vi.spyOn(controller, 'abort');
  const stream: ChatStream = {
    controller,
    async* [Symbol.asyncIterator]() {
      for (const [index, item] of chunks.entries()) {
        if (options.hangAfter === index) {
          await new Promise<never>((_resolve, reject) => {
            controller.signal.addEventListener('abort', () => reject(new Error('aborted upstream')));
          });
        }
        yield item;
      }
    },
  };
  return { stream, controller, abort };
}

function fakeClient(stream: ChatStream | Error) {
  const create = vi.fn(async (_body: unknown, _options?: { signal?: AbortSignal }) => {
    if (stream instanceof Error)
      throw stream;
    return stream;
  });
  const client: OpenAiChatClient = {
    chat: {
      completions: { create },
    },
  };
  return { client, create };
}

async function collect(iterable: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const text of iterable)
    out.push(text);
  return out;
}

describe('openai generator', () => {
  it('requests a streaming completion with the model, system and user messages', async () => {
    const { stream } = fakeStream([
      chunk('Hi'),
    ]);
    const { client, create } = fakeClient(stream);

    await collect(createOpenAiGenerator({ client, model: 'answer-model-1' }).stream({
      system: 'You are helpful.',
      user: 'Question: hello',
    }));

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![0]).toEqual({
      model: 'answer-model-1',
      messages: [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Question: hello' },
      ],
      stream: true,
    });
  });

  it('yields text deltas in order and skips empty and non-text chunks', async () => {
    const { stream } = fakeStream([
      chunk(null),
      chunk('Install '),
      chunk(''),
      chunk('the '),
      chunk(undefined),
      chunk('client.'),
      { choices: [] },
    ]);
    const { client } = fakeClient(stream);

    const text = await collect(createOpenAiGenerator({ client, model: 'm' }).stream({ system: 's', user: 'u' }));

    expect(text).toEqual(['Install ', 'the ', 'client.']);
  });

  it('passes the signal to the SDK request', async () => {
    const { stream } = fakeStream([
      chunk('x'),
    ]);
    const { client, create } = fakeClient(stream);
    const controller = new AbortController();

    await collect(createOpenAiGenerator({ client, model: 'm' }).stream({ system: 's', user: 'u', signal: controller.signal }));

    expect(create.mock.calls[0]![1]).toEqual({ signal: controller.signal });
  });

  it('does not abort the upstream request when the stream completes normally', async () => {
    const { stream, abort } = fakeStream([
      chunk('a'),
      chunk('b'),
    ]);
    const { client } = fakeClient(stream);

    await collect(createOpenAiGenerator({ client, model: 'm' }).stream({ system: 's', user: 'u' }));

    expect(abort).not.toHaveBeenCalled();
  });

  it('cancels the upstream stream and stops when aborted between chunks', async () => {
    const { stream, abort } = fakeStream([
      chunk('one'),
      chunk('two'),
      chunk('three'),
    ]);
    const { client } = fakeClient(stream);
    const controller = new AbortController();
    const seen: string[] = [];

    const consume = (async () => {
      for await (const text of createOpenAiGenerator({ client, model: 'm' }).stream({
        system: 's',
        user: 'u',
        signal: controller.signal,
      })) {
        seen.push(text);
        controller.abort(new Error('client left'));
      }
    })();

    await expect(consume).rejects.toThrow('client left');
    expect(seen).toEqual(['one']);
    expect(abort).toHaveBeenCalled();
  });

  it('cancels the upstream stream immediately when aborted while waiting for a chunk', async () => {
    const { stream, abort } = fakeStream([
      chunk('one'),
      chunk('never'),
    ], { hangAfter: 1 });
    const { client } = fakeClient(stream);
    const controller = new AbortController();
    const seen: string[] = [];

    const consume = (async () => {
      for await (const text of createOpenAiGenerator({ client, model: 'm' }).stream({
        system: 's',
        user: 'u',
        signal: controller.signal,
      }))
        seen.push(text);
    })();

    await vi.waitFor(() => expect(seen).toEqual(['one']));
    controller.abort(new Error('deadline'));

    await expect(consume).rejects.toThrow();
    expect(abort).toHaveBeenCalled();
  });

  it('cancels upstream when the consumer stops reading early', async () => {
    const { stream, abort } = fakeStream([
      chunk('one'),
      chunk('two'),
    ]);
    const { client } = fakeClient(stream);

    const iterator = createOpenAiGenerator({ client, model: 'm' })
      .stream({ system: 's', user: 'u' })[Symbol.asyncIterator]();
    expect((await iterator.next()).value).toBe('one');
    await iterator.return?.();

    expect(abort).toHaveBeenCalled();
  });

  it('does not start a request when already aborted', async () => {
    const { client, create } = fakeClient(fakeStream([]).stream);
    const controller = new AbortController();
    controller.abort(new Error('gone'));

    await expect(collect(createOpenAiGenerator({ client, model: 'm' }).stream({
      system: 's',
      user: 'u',
      signal: controller.signal,
    }))).rejects.toThrow('gone');
    expect(create).not.toHaveBeenCalled();
  });

  it('surfaces request errors', async () => {
    const { client } = fakeClient(new Error('openai 500'));

    await expect(collect(createOpenAiGenerator({ client, model: 'm' }).stream({ system: 's', user: 'u' })))
      .rejects
      .toThrow('openai 500');
  });

  it('cancels upstream and surfaces an error thrown mid-stream', async () => {
    const controller = new AbortController();
    const abort = vi.spyOn(controller, 'abort');
    const stream: ChatStream = {
      controller,
      async* [Symbol.asyncIterator]() {
        yield chunk('partial');
        throw new Error('connection reset');
      },
    };
    const { client } = fakeClient(stream);
    const seen: string[] = [];

    const consume = (async () => {
      for await (const text of createOpenAiGenerator({ client, model: 'm' }).stream({ system: 's', user: 'u' }))
        seen.push(text);
    })();

    await expect(consume).rejects.toThrow('connection reset');
    expect(seen).toEqual(['partial']);
    expect(abort).toHaveBeenCalled();
  });
});

describe('real SDK compatibility', () => {
  it('accepts an OpenAI client as the adapter client', () => {
    const client: OpenAiChatClient = new OpenAI({ apiKey: 'test-key' });

    expect(createOpenAiGenerator({ client, model: 'm' })).toBeDefined();
  });
});
