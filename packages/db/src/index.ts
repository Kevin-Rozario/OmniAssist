import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema> & { $client: pg.Pool };

export interface CreateDbOptions {
  /** Called when an idle pooled connection fails (for example Neon closing it). */
  onPoolError?: (error: Error) => void;
}

export function createDb(url: string, options: CreateDbOptions = {}): Database {
  const pool = new pg.Pool({ connectionString: url, max: 5 });
  // Without a listener, an error on an idle client is an unhandled 'error' event
  // and takes the whole process down.
  pool.on('error', error => options.onPoolError?.(error));
  return drizzle({ client: pool, schema });
}

export { and, asc, desc, eq, sql } from 'drizzle-orm';
