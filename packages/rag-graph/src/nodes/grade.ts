import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import type { PassageGrade, PassageToGrade } from '../ports';
import type { AcceptedSource, RagStateType, RagStateUpdate } from '../state';
import type { RagDeps } from './deps';
import { gradeEvidence } from './decisions';
import { degrade, emit, ensureActive } from './deps';

interface Candidate {
  toGrade: PassageToGrade;
  source: AcceptedSource;
}

function kbCandidates(state: RagStateType): Candidate[] {
  return state.kbChunks.map(passage => ({
    toGrade: { title: passage.filename, text: passage.text, sourceType: 'kb' },
    source: { kind: 'kb', passage },
  }));
}

function webCandidates(state: RagStateType): Candidate[] {
  return state.webResults.map(result => ({
    toGrade: { title: result.title, text: result.content, sourceType: 'web' },
    source: { kind: 'web', result },
  }));
}

/**
 * Grades every passage in parallel and keeps only the ones that pass.
 * With nothing to grade the stage is skipped, so no `grading` status is reported.
 */
function createGradeNode(
  deps: RagDeps,
  stage: 'grade_kb' | 'grade_web',
  candidatesOf: (state: RagStateType) => Candidate[],
  verdictKey: 'kbVerdict' | 'webVerdict',
) {
  return async (state: RagStateType, config: LangGraphRunnableConfig): Promise<RagStateUpdate> => {
    ensureActive(config);

    const candidates = candidatesOf(state);
    if (candidates.length === 0)
      return { [verdictKey]: 'weak', acceptedSources: [] };

    emit(config, { type: 'status', stage: 'grading' });

    const settled = await Promise.allSettled(
      candidates.map(candidate =>
        deps.classifier.gradePassage(state.question, candidate.toGrade, { signal: config.signal }),
      ),
    );

    const grades: Array<PassageGrade | undefined> = settled.map((result) => {
      if (result.status === 'fulfilled')
        return result.value;
      degrade(deps, config, stage, result.reason);
      return undefined;
    });

    const { verdict, accepted } = gradeEvidence(grades, deps.policy);
    return {
      [verdictKey]: verdict,
      acceptedSources: accepted.map(index => candidates[index]!.source),
    };
  };
}

export function createGradeKbNode(deps: RagDeps) {
  return createGradeNode(deps, 'grade_kb', kbCandidates, 'kbVerdict');
}

export function createGradeWebNode(deps: RagDeps) {
  return createGradeNode(deps, 'grade_web', webCandidates, 'webVerdict');
}
