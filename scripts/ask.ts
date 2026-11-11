#!/usr/bin/env node
/**
 * Ask a question of a running OmniAssist API and print the streamed answer.
 *
 * Usage:
 *   pnpm ask --help
 *   pnpm ask --dry-run "How do I set up the VPN?"
 *   ASK_BEARER_TOKEN=<jwt> pnpm ask "How do I set up the VPN?"
 *
 * Environment:
 *   ASK_API_URL       API base URL (default: http://127.0.0.1:3000)
 *   ASK_BEARER_TOKEN  Clerk session JWT for any signed-in user (required unless --dry-run)
 *
 * The answer text goes to stdout as it arrives. Stages, sources and the summary go to stderr,
 * so `pnpm ask "..." > answer.txt` captures only the answer.
 */

import type { AskStreamEvent } from '../packages/types/src/ask-stream';
import process from 'node:process';
import { createAskStreamParser } from '../packages/types/src/ask-stream';

interface CliOptions {
  help: boolean;
  dryRun: boolean;
  question: string;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { help: false, dryRun: false, question: '' };
  const words: string[] = [];
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h')
      options.help = true;
    else if (arg === '--dry-run')
      options.dryRun = true;
    else if (arg.startsWith('--'))
      throw new Error(`Unknown argument: ${arg}\nRun with --help for usage.`);
    else
      words.push(arg);
  }
  options.question = words.join(' ').trim();
  return options;
}

function printHelp(): void {
  process.stdout.write(`Ask a question of a running OmniAssist API and print the streamed answer.

Usage:
  pnpm ask --help
  pnpm ask --dry-run "<question>"
  ASK_BEARER_TOKEN=<jwt> pnpm ask "<question>"

Options:
  -h, --help     Show this help text
  --dry-run      Show the request that would be sent; do not call the API

Environment:
  ASK_API_URL       API base URL (default: http://127.0.0.1:3000)
  ASK_BEARER_TOKEN  Clerk session JWT for any signed-in user (required unless --dry-run)

Output:
  stdout  the answer text, as it streams
  stderr  stages, sources and a summary with the time to first token
`);
}

function renderEvent(event: AskStreamEvent): void {
  switch (event.event) {
    case 'status':
      process.stderr.write(`· ${event.data.stage}\n`);
      break;
    case 'citations':
      process.stderr.write('Sources:\n');
      for (const source of event.data.sources) {
        process.stderr.write(source.kind === 'kb'
          ? `  [${source.n}] ${source.filename} (${source.documentId})\n`
          : `  [${source.n}] ${source.title} <${source.url}>\n`);
      }
      process.stderr.write('Answer:\n');
      break;
    case 'token':
      process.stdout.write(event.data.text);
      break;
    case 'done':
    case 'error':
      break;
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (!options.question)
    throw new Error('A question is required. Run with --help for usage.');

  const apiUrl = (process.env.ASK_API_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
  const endpoint = new URL('/api/v1/ask', apiUrl);

  if (options.dryRun) {
    process.stdout.write(`Dry run only. Would POST to ${endpoint}\n`);
    process.stdout.write(`  question: ${JSON.stringify(options.question)}\n`);
    process.stdout.write(`  token:    ${process.env.ASK_BEARER_TOKEN ? 'set' : 'MISSING (ASK_BEARER_TOKEN)'}\n`);
    return;
  }

  const token = process.env.ASK_BEARER_TOKEN;
  if (!token)
    throw new Error('ASK_BEARER_TOKEN is required. Use --dry-run to preview, or set a Clerk session JWT.');

  const startedAt = performance.now();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'X-Request-Id': crypto.randomUUID(),
    },
    body: JSON.stringify({ question: options.question }),
  });

  if (!response.ok || !response.body) {
    const body = await response.text();
    throw new Error(`Ask failed: HTTP ${response.status} ${body.slice(0, 500)}`);
  }

  process.stderr.write(`request id: ${response.headers.get('X-Request-Id') ?? '(none)'}\n`);

  const parser = createAskStreamParser();
  const decoder = new TextDecoder();
  let firstTokenMs: number | undefined;
  let finished: AskStreamEvent | undefined;

  function handle(events: AskStreamEvent[]): void {
    for (const event of events) {
      if (event.event === 'token' && firstTokenMs === undefined)
        firstTokenMs = Math.round(performance.now() - startedAt);
      if (event.event === 'done' || event.event === 'error')
        finished = event;
      renderEvent(event);
    }
  }

  for await (const chunk of response.body)
    handle(parser.push(decoder.decode(chunk, { stream: true })));
  handle(parser.end());

  process.stdout.write('\n');
  const totalMs = Math.round(performance.now() - startedAt);
  const ttft = firstTokenMs === undefined
    ? 'n/a'
    : `${firstTokenMs} ms`;

  if (finished?.event === 'done') {
    process.stderr.write(
      `Done: source ${finished.data.answerSource}, confidence ${finished.data.sourceConfidence}, `
      + `first token ${ttft}, total ${totalMs} ms\n`,
    );
  }
  else if (finished?.event === 'error') {
    throw new Error(`Ask failed after the stream started: ${finished.data.title} (request ${finished.data.requestId})`);
  }
  else {
    throw new Error('The stream ended without a done or error event.');
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error
    ? error.message
    : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
