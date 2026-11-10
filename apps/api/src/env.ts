import process from 'node:process';
import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

const originList = z
  .string()
  .transform(value => value.split(',').map(origin => origin.trim()).filter(Boolean))
  .pipe(z.array(z.url({ protocol: /^https?$/ })).min(1))
  .transform(origins => origins.map(origin => new URL(origin).origin));

export const DEFAULT_KB_MAX_UPLOAD_BYTES = 10_485_760;

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z.enum([
      'fatal',
      'error',
      'warn',
      'info',
      'debug',
      'trace',
      'silent',
    ]).default('info'),
    WEB_ORIGINS: originList,
    DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/ }),
    CLERK_SECRET_KEY: z.string().startsWith('sk_'),
    CLERK_PUBLISHABLE_KEY: z.string().startsWith('pk_'),

    R2_ACCOUNT_ID: z.string().min(1),
    R2_ACCESS_KEY_ID: z.string().min(1),
    R2_SECRET_ACCESS_KEY: z.string().min(1),
    R2_BUCKET: z.string().min(1),
    R2_ENDPOINT: z.url({ protocol: /^https?$/ }).optional(),

    PINECONE_API_KEY: z.string().min(1),
    PINECONE_INDEX: z.string().min(1),

    INNGEST_SIGNING_KEY: z.string().min(1),
    INNGEST_EVENT_KEY: z.string().min(1),

    KB_MAX_UPLOAD_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(DEFAULT_KB_MAX_UPLOAD_BYTES),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  onValidationError: (issues) => {
    const lines = issues.map((issue) => {
      const name = issue.path?.map(segment => (typeof segment === 'object'
        ? segment.key
        : segment)).join('.') ?? '(unknown)';
      return `  - ${name}: ${issue.message}`;
    });
    console.error(`Invalid environment configuration:\n${lines.join('\n')}`);
    process.exit(1);
  },
});

export type Env = typeof env;
