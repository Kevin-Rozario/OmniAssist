import type { JevClient } from './jev';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { createJevClassifier, GRADER_QUESTIONS, ROUTER_OPTIONS } from './jev';

const MODEL = 'jev-test-1.0.0';

type Request = Parameters<JevClient['systemOne']>[0];

function fakeClient(answers: Record<string, unknown> | Error, reportedModel = MODEL) {
  const systemOne = vi.fn(async (_request: Request, _options?: { signal?: AbortSignal }) => {
    if (answers instanceof Error)
      throw answers;
    return { model: reportedModel, answers };
  });
  return {
    client: { systemOne } satisfies JevClient,
    systemOne,
  };
}

const noulAnswer = (value: number) => ({ type: 'noul', noul: value });

describe('jev classifier: route', () => {
  it('asks one choice question with kb and direct options and the pinned model', async () => {
    const { client, systemOne } = fakeClient({
      route: {
        type: 'choice',
        choice: 'kb',
        confidence: 0.93,
        probabilities: { kb: 0.93, direct: 0.07 },
      },
    });

    await createJevClassifier({ client, model: MODEL }).route('How do I reset my password?');

    expect(systemOne).toHaveBeenCalledTimes(1);
    const request = systemOne.mock.calls[0]![0];
    expect(request.model).toBe(MODEL);
    expect(request.state).toEqual({ question: 'How do I reset my password?' });
    expect(Object.keys(request.questions)).toEqual(['route']);
    expect(request.questions.route).toEqual({
      type: 'choice',
      instructions: 'Which kind of message is this?',
      criteria: ROUTER_OPTIONS,
    });
    expect(Object.keys(ROUTER_OPTIONS)).toEqual(['kb', 'direct']);
  });

  it('maps the chosen label and its confidence to a route decision', async () => {
    const direct = fakeClient({
      route: { type: 'choice', choice: 'direct', confidence: 0.88 },
    });
    const kb = fakeClient({
      route: { type: 'choice', choice: 'kb', confidence: 0.61 },
    });

    expect(await createJevClassifier({ client: direct.client, model: MODEL }).route('hi'))
      .toEqual({ label: 'direct', confidence: 0.88 });
    expect(await createJevClassifier({ client: kb.client, model: MODEL }).route('vpn'))
      .toEqual({ label: 'kb', confidence: 0.61 });
  });

  it('passes the abort signal to the SDK', async () => {
    const { client, systemOne } = fakeClient({
      route: { type: 'choice', choice: 'kb', confidence: 0.9 },
    });
    const controller = new AbortController();

    await createJevClassifier({ client, model: MODEL }).route('q', { signal: controller.signal });

    expect(systemOne.mock.calls[0]![1]).toEqual({ signal: controller.signal });
  });

  it('logs the model id the API returned, and nothing from the question', async () => {
    const { client } = fakeClient(
      {
        route: { type: 'choice', choice: 'kb', confidence: 0.9 },
      },
      'jev-resolved-9.9.9',
    );
    const info = vi.fn();

    await createJevClassifier({
      client,
      model: MODEL,
      logger: { info },
    }).route('secret question text');

    expect(info).toHaveBeenCalledWith({ stage: 'route', model: 'jev-resolved-9.9.9' }, expect.any(String));
    expect(JSON.stringify(info.mock.calls)).not.toContain('secret question text');
  });

  it('surfaces SDK errors unchanged for the node layer to degrade', async () => {
    const error = new Error('429 rate limited');
    const { client } = fakeClient(error);

    await expect(createJevClassifier({ client, model: MODEL }).route('q')).rejects.toBe(error);
  });

  it('rejects malformed answers', async () => {
    const bad: Array<Record<string, unknown>> = [
      {},
      {
        route: { type: 'noul', noul: 0.5 },
      },
      {
        route: { type: 'choice', choice: 'other', confidence: 0.9 },
      },
      {
        route: { type: 'choice', choice: 'kb', confidence: 'high' },
      },
      {
        route: { type: 'choice', choice: 'kb', confidence: Number.NaN },
      },
    ];

    for (const answers of bad) {
      const { client } = fakeClient(answers);
      await expect(createJevClassifier({ client, model: MODEL }).route('q')).rejects.toThrow(/Jev/);
    }
  });
});

describe('jev classifier: gradePassage', () => {
  const passage = { title: 'vpn-guide.md', text: 'Install the client.', sourceType: 'kb' as const };
  const good = {
    relevant: noulAnswer(0.91),
    usable: noulAnswer(0.82),
    instructs_model: noulAnswer(0.03),
  };

  it('sends one request with the passage in state and three noul questions', async () => {
    const { client, systemOne } = fakeClient(good);

    await createJevClassifier({ client, model: MODEL }).gradePassage('How do I set up the VPN?', passage);

    expect(systemOne).toHaveBeenCalledTimes(1);
    const request = systemOne.mock.calls[0]![0];
    expect(request.model).toBe(MODEL);
    expect(request.state).toEqual({
      question: 'How do I set up the VPN?',
      passage: { title: 'vpn-guide.md', text: 'Install the client.', sourceType: 'kb' },
    });
    expect(Object.keys(request.questions)).toEqual(['relevant', 'usable', 'instructs_model']);
    expect(request.questions).toEqual({
      relevant: { type: 'noul', instructions: GRADER_QUESTIONS.relevant },
      usable: { type: 'noul', instructions: GRADER_QUESTIONS.usable },
      instructs_model: { type: 'noul', instructions: GRADER_QUESTIONS.instructs_model },
    });
  });

  it('sends web passages with sourceType web', async () => {
    const { client, systemOne } = fakeClient(good);

    await createJevClassifier({ client, model: MODEL }).gradePassage('q', { ...passage, sourceType: 'web' });

    expect(systemOne.mock.calls[0]![0].state).toMatchObject({
      passage: { sourceType: 'web' },
    });
  });

  it('maps the three probabilities to a grade', async () => {
    const { client } = fakeClient(good);

    expect(await createJevClassifier({ client, model: MODEL }).gradePassage('q', passage))
      .toEqual({ relevant: 0.91, usable: 0.82, instructsModel: 0.03 });
  });

  it('passes the abort signal to the SDK and logs the returned model id', async () => {
    const { client, systemOne } = fakeClient(good, 'jev-resolved-1.2.3');
    const info = vi.fn();
    const controller = new AbortController();

    await createJevClassifier({
      client,
      model: MODEL,
      logger: { info },
    })
      .gradePassage('q', passage, { signal: controller.signal });

    expect(systemOne.mock.calls[0]![1]).toEqual({ signal: controller.signal });
    expect(info).toHaveBeenCalledWith({ stage: 'grade', model: 'jev-resolved-1.2.3' }, expect.any(String));
  });

  it('surfaces SDK errors unchanged', async () => {
    const error = new Error('jev 500');
    const { client } = fakeClient(error);

    await expect(createJevClassifier({ client, model: MODEL }).gradePassage('q', passage)).rejects.toBe(error);
  });

  it('rejects a missing, non-noul or out-of-range answer', async () => {
    const bad: Array<Record<string, unknown>> = [
      { ...good, usable: undefined },
      {
        ...good,
        relevant: { type: 'choice', choice: 'a', confidence: 1 },
      },
      {
        ...good,
        instructs_model: noulAnswer(1.2),
      },
      {
        ...good,
        relevant: noulAnswer(-0.1),
      },
      {
        ...good,
        usable: noulAnswer(Number.NaN),
      },
    ];

    for (const answers of bad) {
      const { client } = fakeClient(answers);
      await expect(createJevClassifier({ client, model: MODEL }).gradePassage('q', passage))
        .rejects
        .toThrow(/Jev answer/);
    }
  });
});

describe('real SDK compatibility', () => {
  it('accepts a TypeSafeClient as the adapter client', () => {
    const client: JevClient = new TypeSafeClient({ apiKey: 'test-key' });

    expect(createJevClassifier({ client, model: MODEL })).toBeDefined();
  });
});
