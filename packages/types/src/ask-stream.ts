import type { z } from 'zod';
import type { AskEventName } from './ask';
import { AskEventSchemas } from './ask';

/** One validated frame of the `POST /api/v1/ask` event stream. */
export type AskStreamEvent = {
  [Name in AskEventName]: { event: Name; data: z.infer<(typeof AskEventSchemas)[Name]> };
}[AskEventName];

export interface AskStreamParser {
  /** Feed the next chunk of the response body. Returns the events completed by it, in order. */
  push: (chunk: string) => AskStreamEvent[];
  /** Call when the body ends. Returns a final frame that lacked its trailing blank line. */
  end: () => AskStreamEvent[];
}

function parseFrame(block: string): AskStreamEvent | undefined {
  let name: string | undefined;
  const dataLines: string[] = [];

  for (const line of block.split('\n')) {
    if (line === '' || line.startsWith(':'))
      continue;
    const colon = line.indexOf(':');
    const field = colon === -1
      ? line
      : line.slice(0, colon);
    const value = colon === -1
      ? ''
      : line.slice(colon + 1).replace(/^ /, '');
    if (field === 'event')
      name = value;
    else if (field === 'data')
      dataLines.push(value);
  }

  if (name === undefined && dataLines.length === 0)
    return undefined;
  if (name === undefined || !(name in AskEventSchemas))
    throw new Error(`Unknown ask stream event: ${name ?? '(none)'}`);

  const schema = AskEventSchemas[name as AskEventName];
  const result = schema.safeParse(JSON.parse(dataLines.join('\n')));
  if (!result.success)
    throw new Error(`Invalid payload for ask stream event "${name}"`);

  return { event: name, data: result.data } as AskStreamEvent;
}

/** Incremental parser for the ask event stream. Chunks may split frames anywhere. */
export function createAskStreamParser(): AskStreamParser {
  let buffer = '';

  function drain(final: boolean): AskStreamEvent[] {
    const events: AskStreamEvent[] = [];
    const normalized = buffer.replaceAll('\r\n', '\n');
    const blocks = normalized.split('\n\n');
    // Without a final blank line the last block may still be growing.
    buffer = final
      ? ''
      : blocks.pop() ?? '';
    for (const block of blocks) {
      const event = parseFrame(block);
      if (event)
        events.push(event);
    }
    return events;
  }

  return {
    push(chunk) {
      buffer += chunk;
      return drain(false);
    },
    end: () => drain(true),
  };
}
