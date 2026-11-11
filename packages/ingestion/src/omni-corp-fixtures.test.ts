import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { chunkMarkdown, extractDocument } from './index';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '../fixtures');
const omniCorpDir = join(fixturesDir, 'omni-corp');
const adversarialDir = join(omniCorpDir, 'adversarial');

const SUPPORTED = ['.md', '.txt', '.docx', '.pdf'];

function listDocuments(dir: string): string[] {
  return readdirSync(dir)
    .filter(name => SUPPORTED.includes(extname(name)))
    .sort();
}

async function extract(dir: string, name: string) {
  const bytes = new Uint8Array(readFileSync(join(dir, name)));
  return extractDocument(bytes, { filename: name });
}

describe('omni-corp fixtures', () => {
  const documents = listDocuments(omniCorpDir);

  it('covers every supported format', () => {
    const extensions = new Set(documents.map(name => extname(name)));
    expect([...extensions].sort()).toEqual([...SUPPORTED].sort());
  });

  it('is a broad corpus, not a handful of stubs', () => {
    expect(documents.length).toBeGreaterThanOrEqual(25);
  });

  it.each(documents)('parses and chunks %s', async (name) => {
    const extracted = await extract(omniCorpDir, name);
    expect(extracted.empty, name).toBe(false);
    expect(extracted.text.length, name).toBeGreaterThan(300);

    const chunks = chunkMarkdown(extracted.text);
    expect(chunks.length, name).toBeGreaterThan(0);
    expect(chunks[0]?.text, name).toMatch(/Omni Corp/i);
  });

  it('keeps the numbers that other documents rely on consistent', async () => {
    const text = async (name: string) => (await extract(omniCorpDir, name)).text;
    const [password, vpn, catalog, quickRef, incident, handbook] = await Promise.all([
      text('password-policy.md'),
      text('vpn-access.md'),
      text('approved-software-catalog.md'),
      text('it-service-catalog-quick-reference.pdf'),
      text('incident-response.md'),
      text('service-desk-handbook.md'),
    ]);

    expect(password).toContain('14 characters');
    expect(quickRef).toContain('14 character');
    expect(vpn).toContain('vpn.omnicorp.example');
    expect(quickRef).toContain('vpn.omnicorp.example');
    expect(catalog).toContain('JetBrains');
    expect(incident).toContain('within 5 minutes');
    expect(handbook).toContain('within 5 minutes');
  });
});

describe('omni-corp adversarial fixtures', () => {
  const documents = listDocuments(adversarialDir);

  it('are kept out of the default corpus directory listing', () => {
    expect(documents.length).toBeGreaterThan(0);
    for (const name of documents)
      expect(listDocuments(omniCorpDir)).not.toContain(name);
  });

  it.each(documents)('parses %s', async (name) => {
    const extracted = await extract(adversarialDir, name);
    expect(extracted.empty, name).toBe(false);
    expect(chunkMarkdown(extracted.text)[0]?.text, name).toMatch(/Omni Corp/i);
  });

  it('plants a recognisable instruction for the grader to catch', async () => {
    const { text } = await extract(adversarialDir, 'planted-instruction.md');
    expect(text).toMatch(/ignore all previous instructions/i);
  });
});

describe('omni-corp evaluation set', () => {
  it('only names documents that exist', () => {
    const evalSet = readFileSync(join(fixturesDir, 'omni-corp-eval-set.md'), 'utf8');
    const named = [
      ...evalSet.matchAll(/`((?:adversarial\/)?[\w-]+\.(?:md|txt|docx|pdf))`/g),
    ].map(match => match[1]!);

    expect(named.length).toBeGreaterThan(20);
    for (const name of new Set(named))
      expect(existsSync(join(omniCorpDir, name)), name).toBe(true);
  });
});
