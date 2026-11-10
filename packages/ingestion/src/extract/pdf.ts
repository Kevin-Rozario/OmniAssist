import type { ExtractResult } from '../types';
import { extractText, getDocumentProxy } from 'unpdf';

export async function extractPdf(bytes: Uint8Array): Promise<ExtractResult> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  const merged = (Array.isArray(text)
    ? text.join('\n')
    : text)
    .replace(/\r\n/g, '\n')
    .trim();
  return { text: merged, empty: merged.length === 0 };
}
