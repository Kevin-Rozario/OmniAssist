import { describe, expect, it } from 'vitest';
import {
  DocumentDetailSchema,
  DocumentListResponseSchema,
  DocumentStatusSchema,
  DocumentSummarySchema,
  DocumentUploadErrorSchema,
  MeResponseSchema,
  ProblemDetailsSchema,
  RoleSchema,
} from './index';

describe('problemDetailsSchema', () => {
  const base = {
    type: 'https://omni-it-copilot.dev/problems/validation',
    title: 'Validation failed',
    status: 400,
    requestId: 'abc-123',
  };

  it('parses a minimal problem', () => {
    expect(ProblemDetailsSchema.parse(base)).toEqual(base);
  });

  it('parses the validation errors extension', () => {
    const problem = {
      ...base,
      detail: 'Body is invalid',
      errors: [
        { path: 'name', message: 'Required' },
      ],
    };
    expect(ProblemDetailsSchema.parse(problem).errors).toEqual([
      { path: 'name', message: 'Required' },
    ]);
  });

  it('keeps unknown extension members', () => {
    expect(ProblemDetailsSchema.parse({ ...base, retryAfter: 5 })).toMatchObject({ retryAfter: 5 });
  });

  it('rejects a missing request ID', () => {
    const { requestId: _, ...rest } = base;
    expect(ProblemDetailsSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a non-error status', () => {
    expect(ProblemDetailsSchema.safeParse({ ...base, status: 200 }).success).toBe(false);
  });

  it('rejects malformed validation errors', () => {
    expect(ProblemDetailsSchema.safeParse({
      ...base,
      errors: [
        { path: 1 },
      ],
    }).success).toBe(false);
  });
});

describe('roleSchema', () => {
  it('accepts admin and member', () => {
    expect(RoleSchema.parse('admin')).toBe('admin');
    expect(RoleSchema.parse('member')).toBe('member');
  });

  it('rejects other values', () => {
    expect(RoleSchema.safeParse('owner').success).toBe(false);
  });
});

describe('meResponseSchema', () => {
  const me = {
    userId: 'user_1',
    displayName: 'Ada Lovelace',
    primaryEmail: 'ada@omni.dev',
    role: 'member',
  };

  it('parses a profile', () => {
    expect(MeResponseSchema.parse(me)).toEqual(me);
  });

  it('allows a user without an email', () => {
    expect(MeResponseSchema.parse({ ...me, primaryEmail: null }).primaryEmail).toBeNull();
  });

  it('rejects an invalid email and an unknown role', () => {
    expect(MeResponseSchema.safeParse({ ...me, primaryEmail: 'nope' }).success).toBe(false);
    expect(MeResponseSchema.safeParse({ ...me, role: 'root' }).success).toBe(false);
  });
});

describe('documentStatusSchema', () => {
  it('accepts the four lifecycle statuses', () => {
    for (const status of [
      'pending',
      'processing',
      'ready',
      'failed',
    ] as const)
      expect(DocumentStatusSchema.parse(status)).toBe(status);
  });

  it('rejects invalid status values', () => {
    expect(DocumentStatusSchema.safeParse('queued').success).toBe(false);
    expect(DocumentStatusSchema.safeParse('').success).toBe(false);
  });
});

describe('documentSummarySchema', () => {
  const summary = {
    id: '019a1b2c-3d4e-7f80-9abc-def012345678',
    filename: 'vpn-guide.md',
    contentType: 'text/markdown',
    byteSize: 2048,
    status: 'pending',
    createdAt: '2026-11-10T12:00:00.000Z',
    errorSummary: null,
    chunkCount: null,
  };

  it('parses a pending summary', () => {
    expect(DocumentSummarySchema.parse(summary)).toEqual(summary);
  });

  it('parses a failed summary with an error', () => {
    expect(DocumentSummarySchema.parse({
      ...summary,
      status: 'failed',
      errorSummary: 'No extractable text',
    }).errorSummary).toBe('No extractable text');
  });

  it('rejects an invalid status and a non-uuid id', () => {
    expect(DocumentSummarySchema.safeParse({ ...summary, status: 'queued' }).success).toBe(false);
    expect(DocumentSummarySchema.safeParse({ ...summary, id: 'not-a-uuid' }).success).toBe(false);
  });
});

describe('documentDetailSchema', () => {
  const detail = {
    id: '019a1b2c-3d4e-7f80-9abc-def012345678',
    filename: 'vpn-guide.md',
    contentType: 'text/markdown',
    byteSize: 2048,
    status: 'ready',
    createdAt: '2026-11-10T12:00:00.000Z',
    updatedAt: '2026-11-10T12:05:00.000Z',
    errorSummary: null,
    chunkCount: 3,
    uploadedBy: 'user_admin',
    contentHash: 'a'.repeat(64),
  };

  it('parses a ready detail', () => {
    expect(DocumentDetailSchema.parse(detail)).toEqual(detail);
  });

  it('rejects a missing content hash', () => {
    const { contentHash: _, ...rest } = detail;
    expect(DocumentDetailSchema.safeParse(rest).success).toBe(false);
  });
});

describe('documentListResponseSchema', () => {
  it('parses a list of summaries', () => {
    const list = {
      documents: [
        {
          id: '019a1b2c-3d4e-7f80-9abc-def012345678',
          filename: 'a.md',
          contentType: 'text/markdown',
          byteSize: 1,
          status: 'ready',
          createdAt: '2026-11-10T12:00:00.000Z',
          errorSummary: null,
          chunkCount: 1,
        },
      ],
    };
    expect(DocumentListResponseSchema.parse(list).documents).toHaveLength(1);
  });
});

describe('documentUploadErrorSchema', () => {
  it('parses unsupported_format and oversized shapes', () => {
    expect(DocumentUploadErrorSchema.parse({
      reason: 'unsupported_format',
      message: 'Format is not supported',
      contentType: 'application/vnd.ms-excel',
    }).reason).toBe('unsupported_format');

    expect(DocumentUploadErrorSchema.parse({
      reason: 'oversized',
      message: 'File exceeds the size limit',
      maxBytes: 10_485_760,
    }).maxBytes).toBe(10_485_760);
  });

  it('rejects an unknown reason', () => {
    expect(DocumentUploadErrorSchema.safeParse({
      reason: 'virus',
      message: 'nope',
    }).success).toBe(false);
  });
});
