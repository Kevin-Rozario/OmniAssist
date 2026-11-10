import { describe, expect, it } from 'vitest';
import {
  AnswerSourceSchema,
  AskCitationsEventSchema,
  AskDoneEventSchema,
  AskErrorEventSchema,
  AskEventSchemas,
  AskRequestSchema,
  AskStatusEventSchema,
  AskTokenEventSchema,
  DocumentDetailSchema,
  DocumentListResponseSchema,
  DocumentStatusSchema,
  DocumentSummarySchema,
  DocumentUploadErrorSchema,
  MeResponseSchema,
  ProblemDetailsSchema,
  RoleSchema,
  sourceConfidenceFor,
  SourceConfidenceSchema,
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

describe('askRequestSchema', () => {
  it('accepts a question and trims it', () => {
    expect(AskRequestSchema.parse({ question: '  How do I set up a VPN?  ' }).question)
      .toBe('How do I set up a VPN?');
  });

  it('accepts a 2000-character question', () => {
    expect(AskRequestSchema.safeParse({
      question: 'a'.repeat(2000),
    }).success).toBe(true);
  });

  it('rejects empty and whitespace-only questions', () => {
    expect(AskRequestSchema.safeParse({ question: '' }).success).toBe(false);
    expect(AskRequestSchema.safeParse({ question: '   \n\t ' }).success).toBe(false);
  });

  it('rejects a 2001-character question', () => {
    expect(AskRequestSchema.safeParse({
      question: 'a'.repeat(2001),
    }).success).toBe(false);
  });

  it('rejects a missing or non-string question', () => {
    expect(AskRequestSchema.safeParse({}).success).toBe(false);
    expect(AskRequestSchema.safeParse({ question: 42 }).success).toBe(false);
  });

  it('names the question field in the failure', () => {
    const result = AskRequestSchema.safeParse({ question: ' ' });
    expect(result.success
      ? []
      : result.error.issues.map(i => i.path[0])).toContain('question');
  });
});

describe('answer source and confidence', () => {
  it('maps each answer source to its confidence', () => {
    expect(sourceConfidenceFor('kb')).toBe('high');
    expect(sourceConfidenceFor('web')).toBe('medium');
    expect(sourceConfidenceFor('fallback')).toBe('low');
    expect(sourceConfidenceFor('direct')).toBe('not_applicable');
  });

  it('only produces valid confidence values', () => {
    for (const source of AnswerSourceSchema.options)
      expect(SourceConfidenceSchema.safeParse(sourceConfidenceFor(source)).success).toBe(true);
  });

  it('rejects unknown values', () => {
    expect(AnswerSourceSchema.safeParse('cache').success).toBe(false);
    expect(SourceConfidenceSchema.safeParse('certain').success).toBe(false);
  });
});

describe('ask event payload schemas', () => {
  it('parses every status stage and rejects others', () => {
    for (const stage of [
      'routing',
      'searching_kb',
      'grading',
      'searching_web',
      'writing',
    ])
      expect(AskStatusEventSchema.parse({ stage }).stage).toBe(stage);
    expect(AskStatusEventSchema.safeParse({ stage: 'thinking' }).success).toBe(false);
  });

  it('parses kb and web citations', () => {
    const sources = [
      {
        n: 1,
        kind: 'kb',
        documentId: 'doc-1',
        filename: 'vpn-guide.md',
      },
      {
        n: 2,
        kind: 'web',
        title: 'VPN setup',
        url: 'https://example.com/vpn',
      },
    ];
    expect(AskCitationsEventSchema.parse({ sources }).sources).toEqual(sources);
  });

  it('rejects malformed citations', () => {
    expect(AskCitationsEventSchema.safeParse({
      sources: [
        {
          n: 0,
          kind: 'kb',
          documentId: 'd',
          filename: 'f',
        },
      ],
    }).success).toBe(false);
    expect(AskCitationsEventSchema.safeParse({
      sources: [
        {
          n: 1,
          kind: 'web',
          title: 't',
          url: 'not a url',
        },
      ],
    }).success).toBe(false);
    expect(AskCitationsEventSchema.safeParse({
      sources: [
        {
          n: 1,
          kind: 'kb',
          title: 't',
          url: 'https://example.com',
        },
      ],
    }).success).toBe(false);
  });

  it('parses token and done payloads', () => {
    expect(AskTokenEventSchema.parse({ text: 'Hello' }).text).toBe('Hello');
    expect(AskDoneEventSchema.parse({ answerSource: 'web', sourceConfidence: 'medium' }))
      .toEqual({ answerSource: 'web', sourceConfidence: 'medium' });
    expect(AskDoneEventSchema.safeParse({ answerSource: 'web' }).success).toBe(false);
  });

  it('parses a sanitized error payload and requires a request ID', () => {
    const error = {
      type: 'https://omni-it-copilot.dev/problems/upstream',
      title: 'Upstream failure',
      requestId: 'req-1',
    };
    expect(AskErrorEventSchema.parse(error)).toEqual(error);
    const { requestId: _, ...rest } = error;
    expect(AskErrorEventSchema.safeParse(rest).success).toBe(false);
  });

  it('exposes a schema for each of the five event names', () => {
    expect(Object.keys(AskEventSchemas).sort()).toEqual([
      'citations',
      'done',
      'error',
      'status',
      'token',
    ]);
  });
});
