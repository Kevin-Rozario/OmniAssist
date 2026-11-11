import process from 'node:process';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { afterAll, describe, expect, it } from 'vitest';
import { createDb, sql } from './index';
import { conversations, conversationTurns } from './schema';

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

describe('conversation tables', () => {
  it('scopes conversations by user with a recency index', () => {
    const config = getTableConfig(conversations);
    expect(config.name).toBe('conversations');
    expect(config.columns.map(c => c.name)).toEqual([
      'id',
      'user_id',
      'title',
      'created_at',
      'updated_at',
    ]);
    expect(config.indexes.map(i => i.config.name)).toContain('conversations_user_updated_idx');
  });

  it('keeps turns unique per position and cascades on delete', () => {
    const config = getTableConfig(conversationTurns);
    expect(config.name).toBe('conversation_turns');
    expect(config.uniqueConstraints.map(u => u.columns.map(c => c.name))).toContainEqual(['conversation_id', 'position']);
    expect(config.foreignKeys[0]?.onDelete).toBe('cascade');
  });
});
