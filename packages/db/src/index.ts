import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema> & { $client: pg.Pool };

export function createDb(url: string): Database {
  const pool = new pg.Pool({ connectionString: url, max: 5 });
  return drizzle({ client: pool, schema });
}

export { sql } from 'drizzle-orm';
