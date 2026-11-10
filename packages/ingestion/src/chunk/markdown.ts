import type { TextChunk } from '../types';
import type { ChunkOptions } from './recursive';
import { chunkBySeparators } from './recursive';

/** Prefer heading boundaries, then paragraphs, lines, and spaces. */
const MARKDOWN_SEPARATORS = ['\n#', '\n\n', '\n', ' '] as const;

/**
 * Structure-aware Markdown splitter. Heading lines are the preferred cut,
 * and adjacent chunks still overlap by the configured amount.
 */
export function chunkMarkdown(text: string, options: ChunkOptions = {}): TextChunk[] {
  return chunkBySeparators(text, MARKDOWN_SEPARATORS, options);
}
