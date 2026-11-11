import { resolve } from 'node:path';
import process from 'node:process';
import { defineConfig } from 'drizzle-kit';

// Local convenience: reuse the API's .env. Variables already in the shell win, and a missing file is fine.
try {
  process.loadEnvFile(resolve(process.cwd(), '../../apps/api/.env'));
}
catch {}

const url = process.env.DATABASE_URL_DIRECT;
if (!url) {
  throw new Error(
    'DATABASE_URL_DIRECT is required for drizzle-kit (use the non-pooled Neon URL).',
  );
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
