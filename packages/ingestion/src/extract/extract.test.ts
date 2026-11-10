import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { extractDocument, extractDocx, extractPdf, extractPlainText } from './index';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures');

describe('extractPdf', () => {
  it('extracts text from a text PDF fixture', async () => {
    const bytes = new Uint8Array(readFileSync(join(fixtures, 'sample.pdf')));
    const result = await extractPdf(bytes);
    expect(result.empty).toBe(false);
    expect(result.text).toContain('Omni Corp PDF fixture text');
  });
});

describe('extractDocx', () => {
  it('extracts text from a DOCX fixture', async () => {
    const bytes = new Uint8Array(readFileSync(join(fixtures, 'sample.docx')));
    const result = await extractDocx(bytes);
    expect(result.empty).toBe(false);
    expect(result.text).toContain('Omni Corp DOCX fixture text');
  });
});

describe('empty extractable text', () => {
  it('marks empty and whitespace-only sources as empty', () => {
    expect(extractPlainText(readFileSync(join(fixtures, 'empty.txt'))).empty).toBe(true);
    expect(extractPlainText(readFileSync(join(fixtures, 'whitespace.txt'))).empty).toBe(true);
  });
});

describe('extractDocument', () => {
  it('routes by filename extension', async () => {
    const pdf = await extractDocument(
      new Uint8Array(readFileSync(join(fixtures, 'sample.pdf'))),
      { filename: 'policy.pdf' },
    );
    expect(pdf.text).toContain('PDF fixture');

    const docx = await extractDocument(
      new Uint8Array(readFileSync(join(fixtures, 'sample.docx'))),
      { filename: 'policy.docx' },
    );
    expect(docx.text).toContain('DOCX fixture');
  });
});
