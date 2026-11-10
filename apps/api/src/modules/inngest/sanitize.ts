const SECRET_PATTERNS: RegExp[] = [
  /\bsk-[\w-]{8,}\b/g,
  /\bsignkey-[\w-]{8,}\b/g,
  /\bpinecone[_-]?api[_-]?key[=:\s]+[\w-]+/gi,
  /\bBearer\s+[\w.~+/=-]+/gi,
  /\b[A-Z0-9+/]{40,}={0,2}\b/gi,
];

const MAX_SUMMARY_LENGTH = 500;

/** Human-readable failure text with secrets stripped for admin UI. */
export function sanitizeErrorSummary(
  error: unknown,
  fallback = 'Ingestion failed',
): string {
  const raw = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : fallback;

  let sanitized = raw;
  for (const pattern of SECRET_PATTERNS)
    sanitized = sanitized.replace(pattern, '[redacted]');

  sanitized = sanitized.replace(/\s+/g, ' ').trim();
  if (!sanitized)
    return fallback;
  return sanitized.length > MAX_SUMMARY_LENGTH
    ? `${sanitized.slice(0, MAX_SUMMARY_LENGTH - 1)}…`
    : sanitized;
}
