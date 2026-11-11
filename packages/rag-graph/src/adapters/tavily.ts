import type { CallOptions, WebResult, WebSearch } from '../ports';
import { abortable } from './abortable';

/** The part of the Tavily client the adapter uses, so tests can supply a fake. */
export interface TavilySearchClient {
  search: (
    query: string,
    options?: { searchDepth?: 'basic'; maxResults?: number; timeout?: number },
  ) => Promise<{
    results: Array<{ title?: string; url?: string; content?: string }>;
  }>;
}

export interface TavilyWebSearchOptions {
  client: TavilySearchClient;
  /** Per-request timeout, in seconds as Tavily expects. Omitted means the SDK default. */
  timeoutSeconds?: number;
}

/** Citations render these as links, so only plain web URLs are kept. */
function isWebUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:';
  }
  catch {
    return false;
  }
}

export function createTavilyWebSearch(options: TavilyWebSearchOptions): WebSearch {
  const { client, timeoutSeconds } = options;

  return {
    async search(query: string, call: CallOptions & { maxResults: number }): Promise<WebResult[]> {
      call.signal?.throwIfAborted();

      const response = await abortable(
        client.search(query, {
          searchDepth: 'basic',
          maxResults: call.maxResults,
          ...(timeoutSeconds === undefined
            ? {}
            : { timeout: timeoutSeconds }),
        }),
        call.signal,
      );

      const results: WebResult[] = [];
      for (const item of response.results) {
        const url = item.url?.trim();
        const content = item.content?.trim();
        if (!url || !content || !isWebUrl(url))
          continue;
        results.push({ title: item.title?.trim() || url, url, content });
      }

      return results.slice(0, call.maxResults);
    },
  };
}
