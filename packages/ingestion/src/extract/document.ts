import type { ExtractResult, SupportedExtension } from '../types';
import { extractDocx } from './docx';
import { extractMarkdown } from './markdown';
import { extractPdf } from './pdf';
import { extractPlainText } from './text';

const EXTENSION_BY_CONTENT_TYPE: Record<string, SupportedExtension> = {
  'text/plain': '.txt',
  'text/markdown': '.md',
  'text/x-markdown': '.md',
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
};

export function extensionFromFilename(filename: string): SupportedExtension | null {
  const match = filename.toLowerCase().match(/(\.[a-z0-9]+)$/);
  if (!match)
    return null;
  const ext = match[1];
  if (ext === '.txt' || ext === '.md' || ext === '.pdf' || ext === '.docx')
    return ext;
  return null;
}

export function resolveExtension(input: {
  filename?: string;
  contentType?: string;
}): SupportedExtension | null {
  if (input.filename) {
    const fromName = extensionFromFilename(input.filename);
    if (fromName)
      return fromName;
  }
  if (input.contentType) {
    const normalized = input.contentType.split(';')[0]?.trim().toLowerCase();
    if (normalized && normalized in EXTENSION_BY_CONTENT_TYPE)
      return EXTENSION_BY_CONTENT_TYPE[normalized] ?? null;
  }
  return null;
}

export async function extractDocument(
  bytes: Uint8Array,
  input: { filename?: string; contentType?: string },
): Promise<ExtractResult> {
  const extension = resolveExtension(input);
  if (!extension)
    throw new Error('Unsupported document format');

  switch (extension) {
    case '.txt':
      return extractPlainText(bytes);
    case '.md':
      return extractMarkdown(bytes);
    case '.pdf':
      return extractPdf(bytes);
    case '.docx':
      return extractDocx(bytes);
  }
}
