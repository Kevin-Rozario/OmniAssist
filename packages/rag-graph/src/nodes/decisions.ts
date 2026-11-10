import type { RagPolicy } from '../policy';
import type { PassageGrade, RouteDecision, RouteLabel } from '../ports';
import type { Verdict } from '../state';

/**
 * `direct` only when the router chose it and is confident enough.
 * Anything else, including no decision because the classifier failed, goes to the KB.
 */
export function decideRoute(
  decision: RouteDecision | undefined,
  minConfidence: number,
): RouteLabel {
  return decision?.label === 'direct' && decision.confidence >= minConfidence
    ? 'direct'
    : 'kb';
}

/**
 * A passage is accepted when it is relevant, usable and does not try to instruct the model.
 * A passage that looks like an injection is rejected however relevant it is.
 */
export function acceptPassage(
  grade: PassageGrade,
  thresholds: Pick<RagPolicy, 'relevantMin' | 'usableMin' | 'injectionMax'>,
): boolean {
  return grade.relevant >= thresholds.relevantMin
    && grade.usable >= thresholds.usableMin
    && grade.instructsModel < thresholds.injectionMax;
}

export interface EvidenceGrade {
  verdict: Verdict;
  /** Positions, in the order given, of the passages that were accepted. */
  accepted: number[];
}

/**
 * Turns per-passage grades into a verdict.
 * `undefined` means grading that passage failed. Any failure makes the whole set `weak`
 * with nothing accepted, so no passage that was not screened can reach the generator.
 */
export function gradeEvidence(
  grades: ReadonlyArray<PassageGrade | undefined>,
  thresholds: Pick<RagPolicy, 'relevantMin' | 'usableMin' | 'injectionMax'>,
): EvidenceGrade {
  if (grades.includes(undefined))
    return { verdict: 'weak', accepted: [] };

  const accepted: number[] = [];
  grades.forEach((grade, index) => {
    if (grade && acceptPassage(grade, thresholds))
      accepted.push(index);
  });

  return {
    verdict: accepted.length > 0
      ? 'good'
      : 'weak',
    accepted,
  };
}
