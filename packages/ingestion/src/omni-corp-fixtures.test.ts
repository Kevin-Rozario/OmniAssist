import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { chunkMarkdown, extractDocument } from './index';

const omniCorpDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '../fixtures/omni-corp',
);

describe('omni-corp fixtures', () => {
  it('parses and chunks each Omni Corp Markdown fixture', async () => {
    const files = readdirSync(omniCorpDir).filter(name => name.endsWith('.md'));
    expect(files.length).toBeGreaterThan(0);

    for (const name of files) {
      const bytes = new Uint8Array(readFileSync(join(omniCorpDir, name)));
      const extracted = await extractDocument(bytes, { filename: name });
      expect(extracted.empty, name).toBe(false);
      expect(extracted.text.length, name).toBeGreaterThan(50);

      const chunks = chunkMarkdown(extracted.text);
      expect(chunks.length, name).toBeGreaterThan(0);
      expect(chunks[0]?.text, name).toMatch(/Omni Corp/i);
    }
  });
});
