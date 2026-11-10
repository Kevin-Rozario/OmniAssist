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

describe('createDb pool errors', () => {
  it('routes idle connection errors to onPoolError instead of crashing', async () => {
    const errors: Error[] = [];
    const db = createDb('postgresql://user:pass@127.0.0.1:1/none', {
      onPoolError: error => errors.push(error),
    });

    const failure = new Error('terminating connection due to administrator command');
    expect(() => db.$client.emit('error', failure)).not.toThrow();
    expect(errors).toEqual([failure]);

    await db.$client.end();
  });
});
