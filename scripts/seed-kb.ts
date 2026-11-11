#!/usr/bin/env node
/**
 * Upload the Omni Corp knowledge-base fixtures (.md, .txt, .docx, .pdf) to a running OmniAssist API.
 *
 * Usage:
 *   pnpm seed-kb --help
 *   pnpm seed-kb --dry-run
 *   pnpm seed-kb --with-adversarial   (also uploads the planted-instruction and stale-policy documents)
 *   SEED_BEARER_TOKEN=<admin-jwt> pnpm seed-kb
 *   SEED_API_URL=http://127.0.0.1:3000 SEED_BEARER_TOKEN=… pnpm seed-kb
 *
 * Environment:
 *   SEED_API_URL       API base URL (default: http://127.0.0.1:3000)
 *   SEED_BEARER_TOKEN  Clerk session JWT for an admin user (required unless --dry-run)
 */

import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(scriptDir, '../packages/ingestion/fixtures/omni-corp');

interface CliOptions {
  help: boolean;
  dryRun: boolean;
  withAdversarial: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { help: false, dryRun: false, withAdversarial: false };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h')
      options.help = true;
    else if (arg === '--dry-run')
      options.dryRun = true;
    else if (arg === '--with-adversarial')
      options.withAdversarial = true;
    else
      throw new Error(`Unknown argument: ${arg}\nRun with --help for usage.`);
  }
  return options;
}

function printHelp(): void {
  process.stdout.write(`Upload Omni Corp knowledge-base fixtures to a running API.

Usage:
  pnpm seed-kb --help
  pnpm seed-kb --dry-run
  SEED_BEARER_TOKEN=<admin-jwt> pnpm seed-kb

Options:
  -h, --help     Show this help text
  --dry-run      List fixture files that would be uploaded; do not call the API
  --with-adversarial
                 Also upload adversarial/ (a prompt-injection note and a superseded policy).
                 Use only on a dev knowledge base to test grading; never in production.

Environment:
  SEED_API_URL       API base URL (default: http://127.0.0.1:3000)
  SEED_BEARER_TOKEN  Clerk session JWT for an admin user (required unless --dry-run)

Fixtures directory:
  ${fixturesDir}
`);
}

const SUPPORTED_EXTENSIONS = ['.md', '.txt', '.docx', '.pdf'] as const;
const CONTENT_TYPES: Record<string, string> = {
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

/** Paths relative to the fixtures directory. Adversarial documents are opt-in. */
function listFixtures(withAdversarial: boolean): string[] {
  const list = (dir: string): string[] => readdirSync(join(fixturesDir, dir))
    .filter(name => SUPPORTED_EXTENSIONS.includes(extname(name) as typeof SUPPORTED_EXTENSIONS[number]))
    .sort()
    .map(name => join(dir, name));

  return [
    ...list('.'),
    ...(withAdversarial
      ? list('adversarial')
      : []),
  ];
}

async function uploadFixture(
  apiUrl: string,
  token: string,
  relativePath: string,
): Promise<{ id: string; status: string }> {
  const filename = basename(relativePath);
  const bytes = readFileSync(join(fixturesDir, relativePath));
  const form = new FormData();
  form.append(
    'file',
    new Blob([bytes], { type: CONTENT_TYPES[extname(filename)] }),
    filename,
  );

  const response = await fetch(new URL('/v1/documents', apiUrl), {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Request-Id': crypto.randomUUID(),
    },
    body: form,
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `Upload failed for ${filename}: HTTP ${response.status} ${body.slice(0, 500)}`,
    );
  }

  const parsed = JSON.parse(body) as { id: string; status: string };
  return parsed;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const fixtures = listFixtures(options.withAdversarial);
  if (fixtures.length === 0)
    throw new Error(`No fixtures found in ${fixturesDir}`);

  const apiUrl = (process.env.SEED_API_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');

  process.stdout.write(`Fixtures (${fixtures.length}) from ${fixturesDir}:\n`);
  for (const name of fixtures)
    process.stdout.write(`  - ${name}\n`);

  if (options.dryRun) {
    process.stdout.write(`\nDry run only. Would POST each file to ${apiUrl}/v1/documents\n`);
    return;
  }

  const token = process.env.SEED_BEARER_TOKEN;
  if (!token) {
    throw new Error(
      'SEED_BEARER_TOKEN is required for upload. Use --dry-run to preview, or set an admin Clerk session JWT.',
    );
  }

  process.stdout.write(`\nUploading to ${apiUrl}/v1/documents …\n`);
  for (const name of fixtures) {
    const result = await uploadFixture(apiUrl, token, name);
    process.stdout.write(`  ✓ ${name} → ${result.id} (${result.status})\n`);
  }
  process.stdout.write('\nDone. Ingestion continues asynchronously via Inngest.\n');
}

main().catch((error: unknown) => {
  const message = error instanceof Error
    ? error.message
    : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
