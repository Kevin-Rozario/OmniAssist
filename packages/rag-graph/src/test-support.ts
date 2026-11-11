import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import type { RagDeps, RagLogger } from './nodes/deps';
import type {
  Classifier,
  GenerateRequest,
  Generator,
  GraphEvent,
  KbPassage,
  KbRetriever,
  PassageGrade,
  PassageToGrade,
  RouteDecision,
  WebResult,
  WebSearch,
} from './ports';
import type { RagStateType } from './state';
import { policy } from './policy';

export const GOOD_GRADE: PassageGrade = { relevant: 0.9, usable: 0.9, instructsModel: 0.01 };
export const OFF_TOPIC_GRADE: PassageGrade = { relevant: 0.05, usable: 0.05, instructsModel: 0.01 };
export const INJECTED_GRADE: PassageGrade = { relevant: 0.95, usable: 0.95, instructsModel: 0.99 };

export function kbPassage(overrides: Partial<KbPassage> = {}): KbPassage {
  return {
    documentId: 'doc-1',
    filename: 'vpn-guide.md',
    chunkIndex: 0,
    text: 'Install the VPN client from the portal.',
    score: 0.8,
    ...overrides,
  };
}

export function webResult(overrides: Partial<WebResult> = {}): WebResult {
  return {
    title: 'VPN setup',
    url: 'https://example.com/vpn',
    content: 'Download the client and sign in.',
    ...overrides,
  };
}

export interface FakeClassifierOptions {
  route?: RouteDecision | Error;
  /** Grade per passage. Return an `Error` to make that grading call reject. */
  grade?: (passage: PassageToGrade) => PassageGrade | Error;
}

export function fakeClassifier(options: FakeClassifierOptions = {}): Classifier & {
  routeCalls: string[];
  gradeCalls: PassageToGrade[];
} {
  const routeCalls: string[] = [];
  const gradeCalls: PassageToGrade[] = [];
  return {
    routeCalls,
    gradeCalls,
    async route(question) {
      routeCalls.push(question);
      const result = options.route ?? { label: 'kb', confidence: 0.9 };
      if (result instanceof Error)
        throw result;
      return result;
    },
    async gradePassage(_question, passage) {
      gradeCalls.push(passage);
      const result = (options.grade ?? (() => GOOD_GRADE))(passage);
      if (result instanceof Error)
        throw result;
      return result;
    },
  };
}

export function fakeRetriever(
  result: KbPassage[] | Error | (() => KbPassage[] | Promise<KbPassage[]>) = [],
): KbRetriever & { calls: Array<{ query: string; topK: number }> } {
  const calls: Array<{ query: string; topK: number }> = [];
  return {
    calls,
    async retrieve(query, { topK }) {
      calls.push({ query, topK });
      if (result instanceof Error)
        throw result;
      return typeof result === 'function'
        ? result()
        : result;
    },
  };
}

export function fakeWebSearch(
  result: WebResult[] | Error = [],
): WebSearch & { calls: Array<{ query: string; maxResults: number }> } {
  const calls: Array<{ query: string; maxResults: number }> = [];
  return {
    calls,
    async search(query, { maxResults }) {
      calls.push({ query, maxResults });
      if (result instanceof Error)
        throw result;
      return result;
    },
  };
}

export interface FakeGenerator extends Generator {
  requests: GenerateRequest[];
  /** Number of streams that were started and then closed, normally or early. */
  closed: number;
}

/** Yields `chunks` in order, honours the abort signal and records when its stream is closed. */
export function fakeGenerator(
  chunks: string[] = ['Hello', ' world'],
  options: { failAfter?: number; error?: Error } = {},
): FakeGenerator {
  const generator: FakeGenerator = {
    requests: [],
    closed: 0,
    stream(request) {
      generator.requests.push(request);
      return (async function* () {
        try {
          for (const [index, chunk] of chunks.entries()) {
            if (options.failAfter === index)
              throw options.error ?? new Error('generator failed');
            if (request.signal?.aborted)
              return;
            await Promise.resolve();
            yield chunk;
          }
          if (options.failAfter !== undefined && options.failAfter >= chunks.length)
            throw options.error ?? new Error('generator failed');
        }
        finally {
          generator.closed += 1;
        }
      })();
    },
  };
  return generator;
}

export function fakeLogger(): RagLogger & {
  warnings: Array<{ fields: Record<string, unknown>; message: string }>;
  infos: Array<{ fields: Record<string, unknown>; message: string }>;
} {
  const warnings: Array<{ fields: Record<string, unknown>; message: string }> = [];
  const infos: Array<{ fields: Record<string, unknown>; message: string }> = [];
  return {
    warnings,
    infos,
    info: (fields, message) => {
      infos.push({ fields, message });
    },
    warn: (fields, message) => {
      warnings.push({ fields, message });
    },
  };
}

export function fakeDeps(overrides: Partial<RagDeps> = {}): RagDeps & { logger: ReturnType<typeof fakeLogger> } {
  const logger = fakeLogger();
  return {
    classifier: fakeClassifier(),
    retriever: fakeRetriever(),
    webSearch: fakeWebSearch(),
    generator: fakeGenerator(),
    policy,
    ...overrides,
    logger: (overrides.logger as ReturnType<typeof fakeLogger> | undefined) ?? logger,
  };
}

export function fakeConfig(
  signal?: AbortSignal,
  onEvent?: (event: GraphEvent) => void,
): LangGraphRunnableConfig & { events: GraphEvent[] } {
  const events: GraphEvent[] = [];
  return {
    events,
    signal,
    writer: (event: unknown) => {
      events.push(event as GraphEvent);
      onEvent?.(event as GraphEvent);
    },
  } as LangGraphRunnableConfig & { events: GraphEvent[] };
}

export function initialState(overrides: Partial<RagStateType> = {}): RagStateType {
  return {
    question: 'How do I set up the VPN?',
    originalQuestion: '',
    history: [],
    route: 'kb',
    kbChunks: [],
    kbVerdict: 'weak',
    webResults: [],
    webVerdict: 'weak',
    acceptedSources: [],
    answerSource: undefined,
    ...overrides,
  };
}

export function stages(events: readonly GraphEvent[]): string[] {
  return events.flatMap(event => (event.type === 'status'
    ? [event.stage]
    : []));
}
