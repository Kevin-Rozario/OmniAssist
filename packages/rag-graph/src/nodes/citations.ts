import type { Citation } from '@omni/types';
import type { PromptSource } from '../prompts';
import type { AcceptedSource } from '../state';

/**
 * Citations are built here from accepted sources, never parsed from model output.
 * Numbering starts at 1 and follows array order, the same order `toPromptSources` uses,
 * so `[n]` in the answer, the `<sources>` block and the `citations` event all agree.
 */
export function buildCitations(sources: readonly AcceptedSource[]): Citation[] {
  return sources.map((source, index) => {
    const n = index + 1;
    return source.kind === 'kb'
      ? {
          n,
          kind: 'kb',
          documentId: source.passage.documentId,
          filename: source.passage.filename,
        }
      : {
          n,
          kind: 'web',
          title: source.result.title,
          url: source.result.url,
        };
  });
}

export function toPromptSources(sources: readonly AcceptedSource[]): PromptSource[] {
  return sources.map(source =>
    source.kind === 'kb'
      ? { title: source.passage.filename, text: source.passage.text }
      : { title: source.result.title, text: source.result.content },
  );
}
