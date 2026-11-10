import type { ExtractResult } from '../types';

export function extractPlainText(bytes: Uint8Array): ExtractResult {
  const text = new TextDecoder('utf-8').decode(bytes).replace(/\r\n/g, '\n');
  const trimmed = text.trim();
  return { text: trimmed, empty: trimmed.length === 0 };
}
