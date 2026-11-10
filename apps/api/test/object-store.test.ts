import { describe, expect, it, vi } from 'vitest';
import { createObjectStore, r2Endpoint } from '../src/lib/object-store';

describe('r2Endpoint', () => {
  it('derives the default Cloudflare endpoint from the account id', () => {
    expect(r2Endpoint('abc123')).toBe('https://abc123.r2.cloudflarestorage.com');
  });

  it('uses an explicit endpoint without a trailing slash', () => {
    expect(r2Endpoint('abc123', 'https://custom.example/')).toBe('https://custom.example');
  });
});

describe('createObjectStore', () => {
  it('puts, gets and deletes through the injected client', async () => {
    const putObject = vi.fn(async () => {});
    const getObject = vi.fn(async () => new Uint8Array([1, 2, 3]));
    const deleteObject = vi.fn(async () => {});

    const store = createObjectStore({
      bucket: 'kb',
      client: { putObject, getObject, deleteObject },
    });

    const body = new Uint8Array([9, 9]);
    await store.put('kb/doc-1/a.md', body, 'text/markdown');
    await expect(store.get('kb/doc-1/a.md')).resolves.toEqual(new Uint8Array([1, 2, 3]));
    await store.delete('kb/doc-1/a.md');

    expect(putObject).toHaveBeenCalledWith({
      bucket: 'kb',
      key: 'kb/doc-1/a.md',
      body,
      contentType: 'text/markdown',
    });
    expect(getObject).toHaveBeenCalledWith({ bucket: 'kb', key: 'kb/doc-1/a.md' });
    expect(deleteObject).toHaveBeenCalledWith({ bucket: 'kb', key: 'kb/doc-1/a.md' });
  });
});
