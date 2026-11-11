import { describe, expect, it } from 'vitest';
import { fakeConfig, fakeDeps, fakeGenerator, fakeLogger, initialState } from '../test-support';
import { createRewriteQuestionNode } from './rewrite';

const history = [
  { question: 'How do I set up the VPN on Windows?', answer: 'Install the client from the portal.' },
];

describe('rewrite_question node', () => {
  it('passes through with no model call when there is no history', async () => {
    const generator = fakeGenerator(['should not run']);
    const deps = fakeDeps({ generator });

    const update = await createRewriteQuestionNode(deps)(initialState({ question: 'Hello there' }), fakeConfig());

    expect(update).toEqual({ originalQuestion: 'Hello there', question: 'Hello there' });
    expect(generator.requests).toEqual([]);
  });

  it('rewrites a follow-up into a standalone question and keeps the original', async () => {
    const generator = fakeGenerator(['How do I set up ', 'the VPN on a Mac?']);
    const logger = fakeLogger();
    const deps = fakeDeps({ generator, logger });

    const update = await createRewriteQuestionNode(deps)(
      initialState({ question: 'and on a Mac?', history }),
      fakeConfig(),
    );

    expect(update).toEqual({ originalQuestion: 'and on a Mac?', question: 'How do I set up the VPN on a Mac?' });
    expect(generator.requests).toHaveLength(1);
    expect(generator.requests[0]?.user).toContain('<conversation>');
    expect(generator.requests[0]?.user).toContain('and on a Mac?');
    expect(logger.infos).toHaveLength(1);
    expect(logger.infos[0]?.fields).toMatchObject({ stage: 'rewrite_question', changed: true });
  });

  it('strips quotes and labels from the rewrite', async () => {
    const deps = fakeDeps({
      generator: fakeGenerator(['Standalone question: "How do I reset my password?"']),
    });
    const update = await createRewriteQuestionNode(deps)(
      initialState({ question: 'and how do I reset it?', history }),
      fakeConfig(),
    );
    expect(update).toMatchObject({ question: 'How do I reset my password?' });
  });

  it('keeps a question that already stands alone unchanged', async () => {
    const logger = fakeLogger();
    const deps = fakeDeps({
      generator: fakeGenerator(['How do I reset my password?']),
      logger,
    });
    const update = await createRewriteQuestionNode(deps)(
      initialState({ question: 'How do I reset my password?', history }),
      fakeConfig(),
    );
    expect(update).toEqual({ originalQuestion: 'How do I reset my password?', question: 'How do I reset my password?' });
    expect(logger.infos[0]?.fields).toMatchObject({ changed: false });
  });

  it('falls back to the original question on failure with a text-free log', async () => {
    const logger = fakeLogger();
    const deps = fakeDeps({
      generator: fakeGenerator([], {
        failAfter: 0,
        error: new Error('boom: and on a Mac?'),
      }),
      logger,
    });

    const update = await createRewriteQuestionNode(deps)(
      initialState({ question: 'and on a Mac?', history }),
      fakeConfig(),
    );

    expect(update).toEqual({ originalQuestion: 'and on a Mac?', question: 'and on a Mac?' });
    expect(logger.warnings).toHaveLength(1);
    expect(JSON.stringify(logger.warnings)).not.toContain('Mac');
    expect(JSON.stringify(logger.warnings)).not.toContain('Windows');
  });

  it('falls back when the rewrite is empty or absurdly long', async () => {
    for (const output of [
      '   ',
      'x'.repeat(501),
    ]) {
      const deps = fakeDeps({
        generator: fakeGenerator([output]),
      });
      const update = await createRewriteQuestionNode(deps)(
        initialState({ question: 'and on a Mac?', history }),
        fakeConfig(),
      );
      expect(update).toMatchObject({ question: 'and on a Mac?' });
    }
  });

  it('rethrows when the request was cancelled instead of degrading', async () => {
    const controller = new AbortController();
    const deps = fakeDeps({
      generator: fakeGenerator(['x'], { failAfter: 0 }),
    });
    const node = createRewriteQuestionNode(deps);
    controller.abort(new Error('cancelled'));
    await expect(node(initialState({ question: 'q', history }), fakeConfig(controller.signal))).rejects.toThrow();
  });
});
