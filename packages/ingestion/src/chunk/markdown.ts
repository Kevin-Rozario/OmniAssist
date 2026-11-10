import type { TextChunk } from '../types';
import type { ChunkOptions } from './recursive';
import { chunkText } from './recursive';

const HEADING_RE = /^#{1,6} .+$/m;

/**
 * Structure-aware lite splitter for Markdown: split on headings first, then
 * recursively chunk each section with the shared character splitter.
 */
export function chunkMarkdown(text: string, options: ChunkOptions = {}): TextChunk[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized)
    return [];

  if (!HEADING_RE.test(normalized))
    return chunkText(normalized, options);

  const sections = splitOnHeadings(normalized);
  const chunks: TextChunk[] = [];
  for (const section of sections) {
    for (const chunk of chunkText(section, options)) {
      chunks.push({ index: chunks.length, text: chunk.text });
    }
  }
  return chunks;
}

function splitOnHeadings(text: string): string[] {
  const lines = text.split('\n');
  const sections: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (/^#{1,6}\s+/.test(line) && current.length > 0) {
      sections.push(current.join('\n').trim());
      current = [line];
      continue;
    }
    current.push(line);
  }

  if (current.length > 0) {
    const section = current.join('\n').trim();
    if (section)
      sections.push(section);
  }

  return sections.filter(Boolean);
}
