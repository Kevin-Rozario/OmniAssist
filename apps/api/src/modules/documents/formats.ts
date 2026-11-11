import type { DocumentUploadError } from '@omni/types';
import { DocumentUploadRejectedError } from '../../lib/errors';

/** Extension → preferred content type for knowledge-base uploads. */
const SUPPORTED_UPLOAD_EXTENSIONS = {
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const;

type SupportedUploadExtension = keyof typeof SUPPORTED_UPLOAD_EXTENSIONS;

function extensionOf(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? filename;
  const dot = base.lastIndexOf('.');
  if (dot <= 0)
    return '';
  return base.slice(dot).toLowerCase();
}

function isSupportedExtension(ext: string): ext is SupportedUploadExtension {
  return Object.hasOwn(SUPPORTED_UPLOAD_EXTENSIONS, ext);
}

/** Original basename for display (paths stripped; empty falls back to `file`). */
export function displayFilename(filename: string): string {
  return filename.split(/[/\\]/).pop()?.trim() || 'file';
}

/** Strip path segments and replace characters unsafe in object keys. */
function safeFilename(filename: string): string {
  const base = displayFilename(filename);
  const cleaned = base.replace(/[^\w.\-+() ]+/g, '_').replace(/\s+/g, ' ').trim();
  return (cleaned || 'file').slice(0, 200);
}

function contentTypeForFilename(filename: string): string | null {
  const ext = extensionOf(filename);
  if (!isSupportedExtension(ext))
    return null;
  return SUPPORTED_UPLOAD_EXTENSIONS[ext];
}

export function assertSupportedUpload(input: {
  filename: string;
  byteSize: number;
  maxBytes: number;
  declaredContentType?: string | null;
}): { contentType: string; safeName: string } {
  const contentType = contentTypeForFilename(input.filename);
  if (!contentType) {
    const uploadError: DocumentUploadError = {
      reason: 'unsupported_format',
      message: 'Format is not supported. Upload a .md, .pdf, .txt, or .docx file.',
      ...(input.declaredContentType
        ? { contentType: input.declaredContentType }
        : {}),
    };
    throw new DocumentUploadRejectedError(uploadError);
  }

  if (input.byteSize > input.maxBytes) {
    throw new DocumentUploadRejectedError({
      reason: 'oversized',
      message: `File exceeds the size limit of ${input.maxBytes} bytes.`,
      maxBytes: input.maxBytes,
      contentType,
    });
  }

  return {
    contentType,
    safeName: safeFilename(input.filename),
  };
}

export function storageKeyFor(documentId: string, safeName: string): string {
  return `kb/${documentId}/${safeName}`;
}
