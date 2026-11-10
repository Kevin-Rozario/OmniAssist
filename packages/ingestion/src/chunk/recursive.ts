import type { TextChunk } from '../types';
import { DEFAULT_CHUNK_OVERLAP, DEFAULT_CHUNK_SIZE } from './defaults';

const TEXT_SEPARATORS = ['\n\n', '\n', ' '] as const;

export interface ChunkOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  /** Highest-priority break first. The splitter keeps the original characters. */
  separators?: readonly string[];
}

/**
 * Sliding-window splitter. Each chunk is a contiguous excerpt of `text`
 * (after newline normalization), and the next chunk starts `chunkOverlap`
 * characters before the previous cut.
 */
export function chunkText(text: string, options: ChunkOptions = {}): TextChunk[] {
  return chunkBySeparators(text, options.separators ?? TEXT_SEPARATORS, options);
}

export function chunkBySeparators(
  text: string,
  separators: readonly string[],
  options: ChunkOptions = {},
): TextChunk[] {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const chunkOverlap = options.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP;
  if (chunkSize <= 0)
    throw new Error('chunkSize must be positive');
  if (chunkOverlap < 0 || chunkOverlap >= chunkSize)
    throw new Error('chunkOverlap must be smaller than chunkSize');

  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized)
    return [];

  const chunks: TextChunk[] = [];
  let start = 0;

  while (start < normalized.length) {
    const hardEnd = Math.min(start + chunkSize, normalized.length);
    const end = hardEnd === normalized.length
      ? hardEnd
      : chooseBreak(normalized, start, hardEnd, separators, chunkOverlap);

    const slice = normalized.slice(start, end);
    if (slice.trim())
      chunks.push({ index: chunks.length, text: slice });

    if (end >= normalized.length)
      break;

    const next = end - chunkOverlap;
    if (next <= start)
      break;
    start = next;
  }

  return chunks;
}

/**
 * Cut at the rightmost preferred separator that still leaves enough of the
 * window for the next chunk to advance. Otherwise cut at `hardEnd`.
 */
function chooseBreak(
  text: string,
  start: number,
  hardEnd: number,
  separators: readonly string[],
  chunkOverlap: number,
): number {
  const earliest = start + chunkOverlap + 1;
  if (earliest >= hardEnd)
    return hardEnd;

  const window = text.slice(earliest, hardEnd);
  for (const separator of separators) {
    const index = window.lastIndexOf(separator);
    if (index !== -1)
      return earliest + index;
  }
  return hardEnd;
}
