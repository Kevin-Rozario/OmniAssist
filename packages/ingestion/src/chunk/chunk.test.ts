import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { extractMarkdown, extractPlainText } from '../extract';
import { chunkMarkdown, chunkText, DEFAULT_CHUNK_OVERLAP, DEFAULT_CHUNK_SIZE } from './index';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures');

describe('extractPlainText', () => {
  it('extracts a short txt fixture', () => {
    const bytes = readFileSync(join(fixtures, 'short.txt'));
    const result = extractPlainText(bytes);
    expect(result.empty).toBe(false);
    expect(result.text).toContain('Omni Corp VPN');
  });
});

describe('chunkText', () => {
  it('returns a single chunk for short text', () => {
    const bytes = readFileSync(join(fixtures, 'short.txt'));
    const { text } = extractPlainText(bytes);
    const chunks = chunkText(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.index).toBe(0);
    expect(chunks[0]?.text).toContain('VPN');
  });

  it('produces multiple overlapping chunks for long text', () => {
    const bytes = readFileSync(join(fixtures, 'long.txt'));
    const { text } = extractPlainText(bytes);
    expect(text.length).toBeGreaterThan(DEFAULT_CHUNK_SIZE);

    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks)
      expect(chunk.text.length).toBeLessThanOrEqual(DEFAULT_CHUNK_SIZE);

    const [first, second] = chunks;
    expect(first && second).toBeTruthy();
    const overlapWindow = first!.text.slice(-DEFAULT_CHUNK_OVERLAP);
    expect(
      second!.text.includes(overlapWindow)
      || overlapWindow.split(/\s+/).some(token => token.length > 8 && second!.text.includes(token)),
    ).toBe(true);
  });
});

describe('chunkMarkdown', () => {
  it('splits on headings before recursive packing', () => {
    const bytes = readFileSync(join(fixtures, 'headings.md'));
    const { text } = extractMarkdown(bytes);
    const chunks = chunkMarkdown(text, { chunkSize: 200, chunkOverlap: 20 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.some(chunk => chunk.text.includes('Password Policy'))).toBe(true);
    expect(chunks.some(chunk => chunk.text.includes('Reset Process'))).toBe(true);
  });
});
