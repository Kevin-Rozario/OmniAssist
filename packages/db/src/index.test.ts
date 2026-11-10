import process from 'node:process';
import { afterAll, describe, expect, it } from 'vitest';
import { createDb, sql } from './index';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('createDb', () => {
  const db = createDb(url ?? '');

  afterAll(async () => {
    await db.$client.end();
  });

  it('runs select 1', async () => {
    const result = await db.execute(sql`select 1 as one`);
    expect(result.rows[0]).toEqual({ one: 1 });
  });

  it('caps the pool at 5 connections', () => {
    expect(db.$client.options.max).toBe(5);
  });
});
