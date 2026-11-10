import type { EmbeddingClient } from '../types';
import OpenAI from 'openai';
import { EMBEDDING_MODEL_ID } from '../constants';

export interface OpenAiEmbeddingsTransport {
  createEmbeddings: (input: {
    model: string;
    input: string[];
  }) => Promise<{ data: Array<{ embedding: number[]; index: number }> }>;
}

export interface OpenAiEmbeddingsOptions {
  transport: OpenAiEmbeddingsTransport;
  /** Max texts per embeddings request. */
  batchSize?: number;
  model?: string;
}

const DEFAULT_BATCH_SIZE = 64;

export function createOpenAiEmbeddingsClient(
  options: OpenAiEmbeddingsOptions,
): EmbeddingClient {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const model = options.model ?? EMBEDDING_MODEL_ID;

  return {
    async embed(texts: string[]): Promise<number[][]> {
      if (texts.length === 0)
        return [];

      const vectors: number[][] = Array.from({ length: texts.length });
      for (let offset = 0; offset < texts.length; offset += batchSize) {
        const batch = texts.slice(offset, offset + batchSize);
        const response = await options.transport.createEmbeddings({
          model,
          input: batch,
        });
        for (const item of response.data) {
          const absoluteIndex = offset + item.index;
          vectors[absoluteIndex] = item.embedding;
        }
      }

      for (const [index, vector] of vectors.entries()) {
        if (!vector)
          throw new Error(`Missing embedding for input index ${index}`);
      }

      return vectors as number[][];
    },
  };
}

/** Build a transport from an OpenAI SDK-like client. */
export function openAiSdkTransport(client: {
  embeddings: {
    create: (body: { model: string; input: string[] }) => Promise<{
      data: Array<{ embedding: number[]; index: number }>;
    }>;
  };
}): OpenAiEmbeddingsTransport {
  return {
    createEmbeddings: body => client.embeddings.create(body),
  };
}

/** Production embeddings client from an OpenAI API key. */
export function createOpenAiEmbeddingsFromApiKey(
  apiKey: string,
  options: Omit<OpenAiEmbeddingsOptions, 'transport'> = {},
): EmbeddingClient {
  const client = new OpenAI({ apiKey });
  return createOpenAiEmbeddingsClient({
    ...options,
    transport: openAiSdkTransport(client),
  });
}
