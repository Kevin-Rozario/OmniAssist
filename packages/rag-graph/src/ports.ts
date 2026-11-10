import type {
  AskCitationsEvent,
  AskDoneEvent,
  AskErrorEvent,
  AskStatusEvent,
  AskTokenEvent,
} from '@omni/types';

/** Where a passage came from. Web passages are graded with the same rules as KB passages. */
export type PassageSourceType = 'kb' | 'web';

export interface KbPassage {
  documentId: string;
  filename: string;
  chunkIndex: number;
  text: string;
  score: number;
}

export interface WebResult {
  title: string;
  url: string;
  content: string;
}

/** Options every port call accepts so a cancelled request stops pending provider calls. */
export interface CallOptions {
  signal?: AbortSignal;
}

export interface KbRetriever {
  retrieve: (query: string, options: CallOptions & { topK: number }) => Promise<KbPassage[]>;
}

export interface WebSearch {
  search: (query: string, options: CallOptions & { maxResults: number }) => Promise<WebResult[]>;
}

export type RouteLabel = 'kb' | 'direct';

export interface RouteDecision {
  label: RouteLabel;
  /** Probability of `label`, 0 to 1. */
  confidence: number;
}

export interface PassageToGrade {
  title: string;
  text: string;
  sourceType: PassageSourceType;
}

/** Probabilities, 0 to 1, that each statement is true of the passage. */
export interface PassageGrade {
  relevant: number;
  usable: number;
  instructsModel: number;
}

export interface Classifier {
  route: (question: string, options?: CallOptions) => Promise<RouteDecision>;
  gradePassage: (
    question: string,
    passage: PassageToGrade,
    options?: CallOptions,
  ) => Promise<PassageGrade>;
}

export interface GenerateRequest extends CallOptions {
  system: string;
  user: string;
}

export interface Generator {
  /** Yields text deltas in order. Stops, and cancels upstream, when the signal aborts. */
  stream: (request: GenerateRequest) => AsyncIterable<string>;
}

/** Events the graph writes to its custom stream channel while it runs. */
export type GraphEvent
  = | ({ type: 'status' } & AskStatusEvent)
    | ({ type: 'citations' } & AskCitationsEvent)
    | ({ type: 'token' } & AskTokenEvent);

/** Every event of an ask stream. The service adds `done` and `error` around the graph's events. */
export type AskEvent
  = | GraphEvent
    | ({ type: 'done' } & AskDoneEvent)
    | ({ type: 'error' } & AskErrorEvent);
