import type { Classifier, Generator, WebSearch } from '../ports';
import type { JevLogger } from './jev';
import { tavily } from '@tavily/core';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import OpenAI from 'openai';
import { createJevClassifier } from './jev';
import { createOpenAiGenerator } from './openai';
import { createTavilyWebSearch } from './tavily';

/** One Tavily request must not outlive most of the whole-request deadline (60s default). */
const TAVILY_TIMEOUT_SECONDS = 10;

export interface SdkJevClassifierOptions {
  apiKey: string;
  model: string;
  logger?: JevLogger;
}

/** Production classifier: the Jev model through the Typesafe SDK. */
export function createSdkJevClassifier(options: SdkJevClassifierOptions): Classifier {
  return createJevClassifier({
    client: new TypeSafeClient({ apiKey: options.apiKey }),
    model: options.model,
    logger: options.logger,
  });
}

export interface SdkOpenAiGeneratorOptions {
  apiKey: string;
  model: string;
}

/** Production generator: streaming chat completions through the OpenAI SDK. */
export function createSdkOpenAiGenerator(options: SdkOpenAiGeneratorOptions): Generator {
  return createOpenAiGenerator({
    client: new OpenAI({ apiKey: options.apiKey }),
    model: options.model,
  });
}

export interface SdkTavilyWebSearchOptions {
  apiKey: string;
}

/** Production web search: Tavily through its SDK. */
export function createSdkTavilyWebSearch(options: SdkTavilyWebSearchOptions): WebSearch {
  return createTavilyWebSearch({
    client: tavily({ apiKey: options.apiKey }),
    timeoutSeconds: TAVILY_TIMEOUT_SECONDS,
  });
}
