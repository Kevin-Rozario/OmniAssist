import process from 'node:process';
import { defineConfig } from 'drizzle-kit';

const url = process.env.DATABASE_URL_DIRECT;
if (!url)
  throw new Error('DATABASE_URL_DIRECT is required for drizzle-kit (use the non-pooled Neon URL).');

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
