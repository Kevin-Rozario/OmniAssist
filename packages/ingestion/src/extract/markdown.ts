import type { ExtractResult } from '../types';
import { extractPlainText } from './text';

/** Markdown is kept as source text (no HTML rendering). */
export function extractMarkdown(bytes: Uint8Array): ExtractResult {
  return extractPlainText(bytes);
}
