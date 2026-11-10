import { describe, expect, it, vi } from 'vitest';
import { EMBEDDING_MODEL_ID } from '../constants';
import { createOpenAiEmbeddingsClient } from './openai';

describe('createOpenAiEmbeddingsClient', () => {
  it('batches requests and uses text-embedding-3-small', async () => {
    const calls: Array<{ model: string; input: string[] }> = [];
    const transport = {
      createEmbeddings: vi.fn(async ({ model, input }) => {
        calls.push({ model, input });
        return {
          data: input.map((_text: string, index: number) => ({
            index,
            embedding: [index, input.length],
          })),
        };
      }),
    };

    const client = createOpenAiEmbeddingsClient({
      transport,
      batchSize: 2,
    });

    const vectors = await client.embed(['a', 'b', 'c']);

    expect(calls).toEqual([
      {
        model: EMBEDDING_MODEL_ID,
        input: ['a', 'b'],
      },
      {
        model: EMBEDDING_MODEL_ID,
        input: ['c'],
      },
    ]);
    expect(EMBEDDING_MODEL_ID).toBe('text-embedding-3-small');
    expect(vectors).toEqual([
      [0, 2],
      [1, 2],
      [0, 1],
    ]);
    expect(transport.createEmbeddings).toHaveBeenCalledTimes(2);
  });
});
