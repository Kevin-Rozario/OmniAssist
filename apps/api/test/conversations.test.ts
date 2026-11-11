import type { NewTurn } from '../src/modules/conversations/repo';
import { CONVERSATION_LIST_MAX, ConversationDetailSchema, ConversationListResponseSchema, ProblemDetailsSchema } from '@omni/types';
import { describe, expect, it } from 'vitest';
import { createConversationsService } from '../src/modules/conversations/service';
import { buildTestApp, fakeVerifier } from './harness';
import { memoryConversationsRepo } from './memory-conversations-repo';

const sessions = {
  'member-token': { userId: 'user_member', role: 'member' as const },
  'other-token': { userId: 'user_other', role: 'member' as const },
  'admin-token': { userId: 'user_admin', role: 'admin' as const },
};

const SECRET = 'my-secret-vpn-question';

function turn(n: number, question = `question ${n}`): NewTurn {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    question,
    answer: `answer ${n}`,
    answerSource: 'kb',
    sourceConfidence: 'high',
    sources: [
      {
        n: 1,
        kind: 'kb',
        documentId: 'doc',
        filename: 'vpn.md',
      },
    ],
  };
}

function uuid(n: number) {
  return `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function setup() {
  let tick = 0;
  const repo = memoryConversationsRepo(() => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)));
  const { app, log } = buildTestApp({
    verifier: fakeVerifier(sessions),
    conversationsService: createConversationsService(repo),
  });
  const call = (token: string | null, path: string, init: RequestInit = {}) => app.request(path, {
    ...init,
    headers: {
      ...(token
        ? { Authorization: `Bearer ${token}` }
        : {}),
      ...(init.body
        ? { 'Content-Type': 'application/json' }
        : {}),
    },
  });
  return { repo, call, log };
}

describe('conversations repo', () => {
  it('never shows or changes a row to a foreign user id', async () => {
    const { repo } = setup();
    await repo.create('user_member', {
      id: uuid(1),
      title: 'mine',
      turn: turn(1),
    });

    expect(await repo.get('user_other', uuid(1))).toBeNull();
    expect(await repo.list('user_other')).toEqual([]);
    expect(await repo.turnCount('user_other', uuid(1))).toBeNull();
    expect(await repo.rename('user_other', uuid(1), 'hacked')).toBeNull();
    expect(await repo.delete('user_other', uuid(1))).toBe(false);
    expect((await repo.appendTurn('user_other', uuid(1), turn(2), 100)).status).toBe('not_found');

    const mine = await repo.get('user_member', uuid(1));
    expect(mine?.title).toBe('mine');
    expect(mine?.turns).toHaveLength(1);
  });

  it('appends turns with consecutive positions and refuses beyond the cap', async () => {
    const { repo } = setup();
    await repo.create('user_member', {
      id: uuid(1),
      title: 't',
      turn: turn(1),
    });
    const second = await repo.appendTurn('user_member', uuid(1), turn(2), 2);
    expect(second).toMatchObject({
      status: 'saved',
      turn: { position: 2 },
    });
    expect((await repo.appendTurn('user_member', uuid(1), turn(3), 2)).status).toBe('full');
    expect(await repo.turnCount('user_member', uuid(1))).toBe(2);
    const positions = (await repo.get('user_member', uuid(1)))?.turns.map(t => t.position);
    expect(positions).toEqual([1, 2]);
  });
});

describe('/api/v1/conversations', () => {
  it('rejects requests without a token', async () => {
    const { call } = setup();
    for (const [method, path] of [
      ['GET', '/api/v1/conversations'],
      ['GET', `/api/v1/conversations/${uuid(1)}`],
      ['PATCH', `/api/v1/conversations/${uuid(1)}`],
      ['DELETE', `/api/v1/conversations/${uuid(1)}`],
    ] as const) {
      const res = await call(null, path, {
        method,
        body: method === 'PATCH'
          ? JSON.stringify({ title: 'x' })
          : undefined,
      });
      expect(res.status).toBe(401);
      expect(res.headers.get('Content-Type')).toBe('application/problem+json');
    }
  });

  it('lists an empty list for a new user', async () => {
    const { call } = setup();
    const res = await call('member-token', '/api/v1/conversations');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ conversations: [] });
  });

  it('lists newest activity first and moves a continued conversation to the top', async () => {
    const { repo, call } = setup();
    await repo.create('user_member', {
      id: uuid(1),
      title: 'first',
      turn: turn(1),
    });
    await repo.create('user_member', {
      id: uuid(2),
      title: 'second',
      turn: turn(2),
    });
    await repo.create('user_other', {
      id: uuid(3),
      title: 'theirs',
      turn: turn(3),
    });

    let list = ConversationListResponseSchema.parse(await (await call('member-token', '/api/v1/conversations')).json());
    expect(list.conversations.map(c => c.title)).toEqual(['second', 'first']);

    await repo.appendTurn('user_member', uuid(1), turn(4), 100);
    list = ConversationListResponseSchema.parse(await (await call('member-token', '/api/v1/conversations')).json());
    expect(list.conversations.map(c => c.title)).toEqual(['first', 'second']);
  });

  it('caps the list at 100 conversations', async () => {
    const { repo, call } = setup();
    for (let i = 1; i <= CONVERSATION_LIST_MAX + 5; i++) {
      await repo.create('user_member', {
        id: uuid(i),
        title: `c${i}`,
        turn: turn(i),
      });
    }
    const list = ConversationListResponseSchema.parse(await (await call('member-token', '/api/v1/conversations')).json());
    expect(list.conversations).toHaveLength(CONVERSATION_LIST_MAX);
    expect(list.conversations[0]?.title).toBe(`c${CONVERSATION_LIST_MAX + 5}`);
  });

  it('reads a conversation with ordered turns', async () => {
    const { repo, call } = setup();
    await repo.create('user_member', {
      id: uuid(1),
      title: 'mine',
      turn: turn(1),
    });
    await repo.appendTurn('user_member', uuid(1), turn(2), 100);
    const res = await call('member-token', `/api/v1/conversations/${uuid(1)}`);
    expect(res.status).toBe(200);
    const detail = ConversationDetailSchema.parse(await res.json());
    expect(detail.title).toBe('mine');
    expect(detail.turns.map(t => t.question)).toEqual(['question 1', 'question 2']);
    expect(detail.turns[0]).toMatchObject({ answerSource: 'kb', sourceConfidence: 'high' });
  });

  it('answers 404 for other users, admins included, and for unknown ids', async () => {
    const { repo, call } = setup();
    await repo.create('user_member', {
      id: uuid(1),
      title: 'mine',
      turn: turn(1),
    });
    for (const token of ['other-token', 'admin-token']) {
      for (const method of ['GET', 'PATCH', 'DELETE']) {
        const res = await call(token, `/api/v1/conversations/${uuid(1)}`, {
          method,
          body: method === 'PATCH'
            ? JSON.stringify({ title: 'x' })
            : undefined,
        });
        expect(res.status).toBe(404);
        ProblemDetailsSchema.parse(await res.json());
      }
    }
    expect((await call('member-token', `/api/v1/conversations/${uuid(99)}`)).status).toBe(404);
    expect((await repo.get('user_member', uuid(1)))?.title).toBe('mine');
  });

  it('renames with a trimmed title and rejects empty or long titles', async () => {
    const { repo, call } = setup();
    await repo.create('user_member', {
      id: uuid(1),
      title: 'mine',
      turn: turn(1),
    });
    const patch = (title: string) => call('member-token', `/api/v1/conversations/${uuid(1)}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    });

    const ok = await patch('  New name  ');
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({
      id: uuid(1),
      title: 'New name',
    });

    for (const bad of [
      '   ',
      '',
      'x'.repeat(61),
    ]) {
      const res = await patch(bad);
      expect(res.status).toBe(400);
      const problem = ProblemDetailsSchema.parse(await res.json());
      expect(JSON.stringify(problem)).toContain('title');
    }
    expect((await repo.get('user_member', uuid(1)))?.title).toBe('New name');
  });

  it('deletes with 204 and then answers 404', async () => {
    const { repo, call } = setup();
    await repo.create('user_member', {
      id: uuid(1),
      title: 'mine',
      turn: turn(1),
    });
    expect((await call('member-token', `/api/v1/conversations/${uuid(1)}`, { method: 'DELETE' })).status).toBe(204);
    expect((await call('member-token', `/api/v1/conversations/${uuid(1)}`)).status).toBe(404);
    expect((await call('member-token', `/api/v1/conversations/${uuid(1)}`, { method: 'DELETE' })).status).toBe(404);
  });

  it('keeps conversation text out of the logs', async () => {
    const { repo, call, log } = setup();
    await repo.create('user_member', {
      id: uuid(1),
      title: SECRET,
      turn: turn(1, SECRET),
    });
    await call('member-token', '/api/v1/conversations');
    await call('member-token', `/api/v1/conversations/${uuid(1)}`);
    await call('member-token', `/api/v1/conversations/${uuid(1)}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: `${SECRET}-renamed` }),
    });
    await call('member-token', `/api/v1/conversations/${uuid(1)}`, { method: 'DELETE' });
    expect(log.lines.length).toBeGreaterThan(0);
    expect(log.lines.join('\n')).not.toContain(SECRET);
    expect(log.lines.join('\n')).not.toContain('answer 1');
  });
});
