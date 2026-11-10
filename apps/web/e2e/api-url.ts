import process from 'node:process';

const DEFAULT_API_URL = 'https://api.omniassist.kevinrozario.com';

/** The API base URL the dev server is started with. Read lazily, after the config loads `.env.local`. */
export function apiUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL;
}
