// Next.js inlines only the global `process.env.NEXT_PUBLIC_*` form.
// An imported `node:process` binding is not replaced in the browser bundle.
/* eslint-disable node/prefer-global/process */
import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  server: {
    CLERK_SECRET_KEY: z.string().startsWith('sk_'),
  },
  client: {
    NEXT_PUBLIC_API_URL: z.url({ protocol: /^https?$/ }),
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().startsWith('pk_'),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  },
  emptyStringAsUndefined: true,
  onValidationError: (issues) => {
    const lines = issues.map((issue) => {
      const name = issue.path?.map((segment) => {
        if (typeof segment === 'object' && segment !== null && 'key' in segment)
          return String(segment.key);
        return String(segment);
      }).join('.') || '(unknown)';
      return `  - ${name}: ${issue.message}`;
    });
    const message = `Invalid environment configuration:\n${lines.join('\n')}`;
    console.error(message);
    throw new Error(message);
  },
});

export type Env = typeof env;
