import type { ExtractResult } from '../types';
import { Buffer } from 'node:buffer';
import mammoth from 'mammoth';

export async function extractDocx(bytes: Uint8Array): Promise<ExtractResult> {
  const result = await mammoth.extractRawText({
    buffer: Buffer.from(bytes),
  });
  const text = result.value.replace(/\r\n/g, '\n').trim();
  return { text, empty: text.length === 0 };
}
