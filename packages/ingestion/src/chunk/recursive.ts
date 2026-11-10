import type { TextChunk } from '../types';
import { DEFAULT_CHUNK_OVERLAP, DEFAULT_CHUNK_SIZE } from './defaults';

const SEPARATORS = ['\n\n', '\n', ' ', ''] as const;

export interface ChunkOptions {
  chunkSize?: number;
  chunkOverlap?: number;
}

/**
 * Recursive character splitter: prefer larger separators, fall back to smaller ones,
 * then hard-slice when a piece still exceeds `chunkSize`.
 */
export function chunkText(text: string, options: ChunkOptions = {}): TextChunk[] {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const chunkOverlap = options.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP;
  if (chunkOverlap >= chunkSize)
    throw new Error('chunkOverlap must be smaller than chunkSize');

  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized)
    return [];

  const pieces = splitRecursive(normalized, [...SEPARATORS], chunkSize);
  return mergeSplits(pieces, chunkSize, chunkOverlap);
}

function splitRecursive(text: string, separators: string[], chunkSize: number): string[] {
  if (text.length <= chunkSize)
    return [text];

  const [separator, ...rest] = separators;
  if (separator === undefined || separator === '')
    return hardSplit(text, chunkSize);

  const parts = text.split(separator).filter(part => part.length > 0);
  const result: string[] = [];
  for (const part of parts) {
    if (part.length <= chunkSize) {
      result.push(part);
      continue;
    }
    result.push(...splitRecursive(part, rest.length > 0
      ? rest
      : [''], chunkSize));
  }
  return result;
}

function hardSplit(text: string, chunkSize: number): string[] {
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize)
    parts.push(text.slice(i, i + chunkSize));
  return parts;
}

function mergeSplits(splits: string[], chunkSize: number, chunkOverlap: number): TextChunk[] {
  const separator = '\n\n';
  const sepLen = separator.length;
  const chunks: TextChunk[] = [];
  const current: string[] = [];
  let total = 0;

  const joinedLength = (parts: string[]) =>
    parts.reduce((sum, part, index) => sum + part.length + (index > 0
      ? sepLen
      : 0), 0);

  for (const split of splits) {
    const nextTotal = total + (current.length > 0
      ? sepLen
      : 0) + split.length;
    if (nextTotal > chunkSize && current.length > 0) {
      const text = current.join(separator).trim();
      if (text)
        chunks.push({ index: chunks.length, text });

      while (
        current.length > 0
        && (total > chunkOverlap
          || total + sepLen + split.length > chunkSize)
      ) {
        const removed = current.shift();
        if (removed === undefined)
          break;
        total -= removed.length;
        if (current.length > 0)
          total -= sepLen;
      }
    }

    current.push(split);
    total = joinedLength(current);
  }

  const trailing = current.join(separator).trim();
  if (trailing)
    chunks.push({ index: chunks.length, text: trailing });

  return chunks.map((chunk, index) => ({ index, text: chunk.text }));
}
