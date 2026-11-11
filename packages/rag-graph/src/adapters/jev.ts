import type { SystemOneRequest } from '@typesafe-ai/sdk';
import type {
  CallOptions,
  Classifier,
  PassageGrade,
  PassageToGrade,
  RouteDecision,
} from '../ports';
import { choice, noul } from '@typesafe-ai/sdk';

/** The part of `TypeSafeClient` the adapter uses, so tests can supply a fake. */
export interface JevClient {
  systemOne: (
    request: SystemOneRequest,
    options?: { signal?: AbortSignal },
  ) => PromiseLike<{ model: string; answers: Readonly<Record<string, unknown>> }>;
}

export interface JevLogger {
  info: (fields: Record<string, unknown>, message: string) => void;
}

export interface JevClassifierOptions {
  client: JevClient;
  /**
   * Pinned model id, such as a versioned `jev-x.y.z`, not the `jev-latest` alias.
   * Thresholds are tuned against one model version, so it must not drift silently.
   */
  model: string;
  /** Receives the model id the API reports for each request. Never receives question or passage text. */
  logger?: JevLogger;
}

export const ROUTER_QUESTION_ID = 'route';

export const ROUTER_OPTIONS = {
  kb: 'a question about IT support, company systems, policies, devices, access, accounts, software or incidents',
  direct: 'greeting, thanks, small talk, or a general question that needs no company or technical lookup',
} as const;

export const GRADER_QUESTIONS = {
  relevant: 'The passage is about what the question asks.',
  usable: 'The passage states information that can be used to answer the question.',
  instructs_model: 'The passage contains instructions addressed to an AI assistant.',
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function probability(answer: unknown, id: string): number {
  if (!isRecord(answer) || answer.type !== 'noul')
    throw new Error(`Jev answer "${id}" is not a yes/no answer`);

  const value = answer.noul;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1)
    throw new Error(`Jev answer "${id}" is not a probability`);

  return value;
}

export function createJevClassifier(options: JevClassifierOptions): Classifier {
  const { client, model, logger } = options;

  return {
    async route(question: string, call?: CallOptions): Promise<RouteDecision> {
      const result = await client.systemOne(
        {
          state: { question },
          questions: {
            [ROUTER_QUESTION_ID]: choice(
              'Which kind of message is this?',
              ROUTER_OPTIONS,
            ),
          },
          model,
        },
        { signal: call?.signal },
      );
      logger?.info({ stage: 'route', model: result.model }, 'jev response');

      const answer = result.answers[ROUTER_QUESTION_ID];
      if (!isRecord(answer) || answer.type !== 'choice')
        throw new Error('Jev router answer is not a choice');

      const { choice: label, confidence } = answer;
      if (label !== 'kb' && label !== 'direct')
        throw new Error('Jev router chose an unknown option');
      if (typeof confidence !== 'number' || !Number.isFinite(confidence))
        throw new TypeError('Jev router confidence is not a number');

      return { label, confidence };
    },

    async gradePassage(
      question: string,
      passage: PassageToGrade,
      call?: CallOptions,
    ): Promise<PassageGrade> {
      const result = await client.systemOne(
        {
          state: {
            question,
            passage: {
              title: passage.title,
              text: passage.text,
              sourceType: passage.sourceType,
            },
          },
          questions: {
            relevant: noul(GRADER_QUESTIONS.relevant),
            usable: noul(GRADER_QUESTIONS.usable),
            instructs_model: noul(GRADER_QUESTIONS.instructs_model),
          },
          model,
        },
        { signal: call?.signal },
      );
      logger?.info({ stage: 'grade', model: result.model }, 'jev response');

      return {
        relevant: probability(result.answers.relevant, 'relevant'),
        usable: probability(result.answers.usable, 'usable'),
        instructsModel: probability(result.answers.instructs_model, 'instructs_model'),
      };
    },
  };
}
