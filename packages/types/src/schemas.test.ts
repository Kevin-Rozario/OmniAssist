import { describe, expect, it } from 'vitest';
import { MeResponseSchema, ProblemDetailsSchema, RoleSchema } from './index';

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
