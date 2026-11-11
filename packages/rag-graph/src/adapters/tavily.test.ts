import type { TavilySearchClient } from './tavily';
import { tavily } from '@tavily/core';
import { describe, expect, it, vi } from 'vitest';
import { createTavilyWebSearch } from './tavily';

type Response = Awaited<ReturnType<TavilySearchClient['search']>>;

function fakeClient(response: Response | Error | (() => Promise<Response>)) {
  const search = vi.fn(async (_query: string, _options?: Parameters<TavilySearchClient['search']>[1]) => {
    if (response instanceof Error)
      throw response;
    return typeof response === 'function'
      ? response()
      : response;
  });
  return {
    client: { search } satisfies TavilySearchClient,
    search,
  };
}

function result(overrides: Record<string, string | undefined> = {}) {
  return {
    title: 'VPN setup',
    url: 'https://example.com/vpn',
    content: 'Download the client and sign in.',
    ...overrides,
  };
}

describe('tavily web search', () => {
  it('searches with basic depth and the requested result limit', async () => {
    const { client, search } = fakeClient({ results: [] });

    await createTavilyWebSearch({ client }).search('how to set up a vpn', { maxResults: 5 });

    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith('how to set up a vpn', { searchDepth: 'basic', maxResults: 5 });
  });

  it('sends a timeout only when configured', async () => {
    const { client, search } = fakeClient({ results: [] });

    await createTavilyWebSearch({ client, timeoutSeconds: 8 }).search('q', { maxResults: 3 });

    expect(search).toHaveBeenCalledWith('q', { searchDepth: 'basic', maxResults: 3, timeout: 8 });
  });

  it('maps results to title, url and content', async () => {
    const { client } = fakeClient({
      results: [
        result(),
        result({ title: 'DNS cache', url: 'https://example.org/dns', content: 'Flush the cache.' }),
      ],
    });

    expect(await createTavilyWebSearch({ client }).search('q', { maxResults: 5 })).toEqual([
      { title: 'VPN setup', url: 'https://example.com/vpn', content: 'Download the client and sign in.' },
      { title: 'DNS cache', url: 'https://example.org/dns', content: 'Flush the cache.' },
    ]);
  });

  it('drops results with no URL or empty content', async () => {
    const { client } = fakeClient({
      results: [
        result({ url: undefined }),
        result({ url: '   ' }),
        result({ content: undefined }),
        result({ content: '  \n ' }),
        result({ title: 'Kept', url: 'https://example.com/kept' }),
      ],
    });

    expect(await createTavilyWebSearch({ client }).search('q', { maxResults: 5 }))
      .toEqual([
        { title: 'Kept', url: 'https://example.com/kept', content: 'Download the client and sign in.' },
      ]);
  });

  it('drops URLs that are not plain web links', async () => {
    const { client } = fakeClient({
      results: [
        result({ url: 'javascript:alert(1)' }),
        result({ url: 'data:text/html,hi' }),
        result({ url: 'not a url' }),
        result({ url: 'http://example.com/plain' }),
      ],
    });

    const out = await createTavilyWebSearch({ client }).search('q', { maxResults: 5 });

    expect(out.map(r => r.url)).toEqual(['http://example.com/plain']);
  });

  it('uses the URL as the title when the title is missing, and trims fields', async () => {
    const { client } = fakeClient({
      results: [
        result({ title: '  ', url: ' https://example.com/a ', content: ' text ' }),
      ],
    });

    expect(await createTavilyWebSearch({ client }).search('q', { maxResults: 5 }))
      .toEqual([
        { title: 'https://example.com/a', url: 'https://example.com/a', content: 'text' },
      ]);
  });

  it('never returns more than the requested number of results', async () => {
    const { client } = fakeClient({
      results: Array.from({ length: 6 }, (_, i) => result({ url: `https://example.com/${i}` })),
    });

    expect(await createTavilyWebSearch({ client }).search('q', { maxResults: 2 })).toHaveLength(2);
  });

  it('returns an empty array for no results', async () => {
    const { client } = fakeClient({ results: [] });

    expect(await createTavilyWebSearch({ client }).search('q', { maxResults: 5 })).toEqual([]);
  });

  it('surfaces provider errors', async () => {
    const { client } = fakeClient(new Error('tavily 500'));

    await expect(createTavilyWebSearch({ client }).search('q', { maxResults: 5 })).rejects.toThrow('tavily 500');
  });

  it('does not search when already aborted', async () => {
    const { client, search } = fakeClient({ results: [] });
    const controller = new AbortController();
    controller.abort(new Error('gone'));

    await expect(createTavilyWebSearch({ client }).search('q', { maxResults: 5, signal: controller.signal }))
      .rejects
      .toThrow('gone');
    expect(search).not.toHaveBeenCalled();
  });

  it('rejects with the abort reason when aborted mid-search', async () => {
    const { client } = fakeClient(() => new Promise<Response>(() => {}));
    const controller = new AbortController();

    const pending = createTavilyWebSearch({ client }).search('q', { maxResults: 5, signal: controller.signal });
    controller.abort(new Error('deadline'));

    await expect(pending).rejects.toThrow('deadline');
  });
});

describe('real SDK compatibility', () => {
  it('accepts a Tavily client as the adapter client', () => {
    const client: TavilySearchClient = tavily({ apiKey: 'test-key' });

    expect(createTavilyWebSearch({ client })).toBeDefined();
  });
});
