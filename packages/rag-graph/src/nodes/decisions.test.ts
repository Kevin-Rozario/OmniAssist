import type { PassageGrade, RouteDecision } from '../ports';
import { describe, expect, it } from 'vitest';
import { policy } from '../policy';
import { acceptPassage, decideRoute, gradeEvidence } from './decisions';

const min = policy.routerMinConfidence;

describe('decideRoute', () => {
  const cases: Array<[string, RouteDecision | undefined, string]> = [
    [
      'direct at exactly the minimum confidence',
      { label: 'direct', confidence: min },
      'direct',
    ],
    [
      'direct above the minimum',
      { label: 'direct', confidence: 0.99 },
      'direct',
    ],
    [
      'direct just below the minimum is uncertain',
      { label: 'direct', confidence: min - 0.001 },
      'kb',
    ],
    [
      'direct with low confidence is uncertain',
      { label: 'direct', confidence: 0.4 },
      'kb',
    ],
    [
      'kb with high confidence',
      { label: 'kb', confidence: 0.99 },
      'kb',
    ],
    [
      'kb with low confidence',
      { label: 'kb', confidence: 0.1 },
      'kb',
    ],
    ['no decision because the classifier failed', undefined, 'kb'],
  ];

  it.each(cases)('%s', (_name, decision, expected) => {
    expect(decideRoute(decision, min)).toBe(expected);
  });

  it('uses the minimum it is given', () => {
    expect(decideRoute({ label: 'direct', confidence: 0.6 }, 0.5)).toBe('direct');
    expect(decideRoute({ label: 'direct', confidence: 0.6 }, 0.61)).toBe('kb');
  });
});

describe('acceptPassage', () => {
  const { relevantMin, usableMin, injectionMax } = policy;
  const grade = (overrides: Partial<PassageGrade> = {}): PassageGrade => ({
    relevant: 0.9,
    usable: 0.9,
    instructsModel: 0.01,
    ...overrides,
  });

  const cases: Array<[string, PassageGrade, boolean]> = [
    [
      'relevant, usable and benign',
      grade(),
      true,
    ],
    [
      'relevant exactly at the minimum',
      grade({ relevant: relevantMin }),
      true,
    ],
    [
      'relevant just below the minimum',
      grade({ relevant: relevantMin - 0.001 }),
      false,
    ],
    [
      'usable exactly at the minimum',
      grade({ usable: usableMin }),
      true,
    ],
    [
      'usable just below the minimum',
      grade({ usable: usableMin - 0.001 }),
      false,
    ],
    [
      'instructs_model just below the maximum',
      grade({ instructsModel: injectionMax - 0.001 }),
      true,
    ],
    [
      'instructs_model exactly at the maximum',
      grade({ instructsModel: injectionMax }),
      false,
    ],
    [
      'highly relevant but instructs the model',
      grade({ relevant: 1, usable: 1, instructsModel: 0.99 }),
      false,
    ],
    [
      'off topic',
      grade({ relevant: 0.05, usable: 0.05 }),
      false,
    ],
    [
      'relevant but nothing usable',
      grade({ usable: 0.1 }),
      false,
    ],
    [
      'usable but off topic',
      grade({ relevant: 0.1 }),
      false,
    ],
  ];

  it.each(cases)('%s', (_name, input, expected) => {
    expect(acceptPassage(input, policy)).toBe(expected);
  });
});

describe('gradeEvidence', () => {
  const good: PassageGrade = { relevant: 0.9, usable: 0.9, instructsModel: 0.01 };
  const offTopic: PassageGrade = { relevant: 0.05, usable: 0.05, instructsModel: 0.01 };
  const injected: PassageGrade = { relevant: 0.95, usable: 0.95, instructsModel: 0.99 };

  it('is good when at least one passage passes and keeps their positions in order', () => {
    expect(gradeEvidence([offTopic, good, injected, good], policy)).toEqual({
      verdict: 'good',
      accepted: [1, 3],
    });
  });

  it('is weak when every passage is off topic', () => {
    expect(gradeEvidence([offTopic, offTopic], policy)).toEqual({ verdict: 'weak', accepted: [] });
  });

  it('is weak when the only relevant passages are injections', () => {
    expect(gradeEvidence([injected, offTopic], policy)).toEqual({ verdict: 'weak', accepted: [] });
  });

  it('is weak for no passages', () => {
    expect(gradeEvidence([], policy)).toEqual({ verdict: 'weak', accepted: [] });
  });

  it('is weak with nothing accepted when any grading call failed, even beside a good passage', () => {
    expect(gradeEvidence([good, undefined], policy)).toEqual({ verdict: 'weak', accepted: [] });
    expect(gradeEvidence([undefined], policy)).toEqual({ verdict: 'weak', accepted: [] });
  });
});
