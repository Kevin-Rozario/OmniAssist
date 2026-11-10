export interface RagPolicy {
  /** `direct` is chosen only when the router picks it with at least this confidence. */
  routerMinConfidence: number;
  /** A passage needs `relevant` at or above this to be accepted. */
  relevantMin: number;
  /** A passage needs `usable` at or above this to be accepted. */
  usableMin: number;
  /** A passage is discarded when `instructs_model` is at or above this. */
  injectionMax: number;
  /** Knowledge-base chunks retrieved per question. */
  kbTopK: number;
  /** Web results requested per question. */
  webMaxResults: number;
}

/**
 * Every threshold and bound of the answer flow, in one place.
 * Passage values follow the Jev cookbook (0.45 / 0.55 / 0.70) and are tuned against the seed corpus.
 */
export const policy: Readonly<RagPolicy> = Object.freeze({
  routerMinConfidence: 0.7,
  relevantMin: 0.45,
  usableMin: 0.55,
  injectionMax: 0.7,
  kbTopK: 8,
  webMaxResults: 5,
});
