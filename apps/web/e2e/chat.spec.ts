import type { Page } from '@playwright/test';
import process from 'node:process';
import { clerk, clerkSetup } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';
import { apiUrl } from './api-url';
import { clerkEmail } from './clerk-user';

const memberProfile = {
  userId: 'user_e2e_member',
  displayName: 'Mo Member',
  primaryEmail: 'mo@example.com',
  role: 'member',
};

declare global {
  interface Window {
    /** Test control over the stubbed ask stream. */
    __ask: {
      requests: string[];
      send: (frame: string) => void;
      close: () => void;
      fail: (status: number) => void;
      mode: 'stream' | 'reject';
      aborted: boolean;
    };
  }
}

/**
 * Replace `fetch` for `POST /v1/ask` with a stream the test feeds by hand, so progress,
 * mid-answer stop and retry can be driven deterministically. Everything else, including
 * the Clerk session, goes through the real `fetch`.
 */
async function stubAskStream(page: Page) {
  await page.addInitScript((askUrl) => {
    const encoder = new TextEncoder();
    const realFetch = window.fetch.bind(window);
    const live: { controller?: ReadableStreamDefaultController<Uint8Array> } = {};
    // Frames, then `null` for "close the stream". Held until the page opens the stream.
    const pending: Array<string | null> = [];
    function flush() {
      while (live.controller && pending.length > 0) {
        const item = pending.shift();
        if (item === null)
          live.controller.close();
        else if (item !== undefined)
          live.controller.enqueue(encoder.encode(item));
      }
    }
    const control: Window['__ask'] = {
      requests: [],
      send: (frame) => {
        // The page opens the stream asynchronously; hold frames until it does.
        pending.push(frame);
        flush();
      },
      close: () => {
        pending.push(null);
        flush();
      },
      fail: () => {},
      mode: 'stream',
      aborted: false,
    };
    window.__ask = control;

    window.fetch = async (input, init) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
      if (url !== askUrl || init?.method !== 'POST')
        return realFetch(input, init);

      const body = JSON.parse(String(init.body)) as { question: string };
      control.requests.push(body.question);

      if (control.mode === 'reject') {
        return new Response(JSON.stringify({
          type: 'about:blank',
          title: 'Internal detail that must not be shown',
          status: 500,
          requestId: 'req-e2e-500',
        }), {
          status: 500,
          headers: { 'content-type': 'application/problem+json' },
        });
      }

      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          live.controller = c;
          flush();
          init.signal?.addEventListener('abort', () => {
            control.aborted = true;
            c.error(new DOMException('Aborted', 'AbortError'));
          });
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    };
  }, new URL('/v1/ask', apiUrl()).href);
}

const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

async function send(page: Page, event: string, data: unknown) {
  await page.evaluate(text => window.__ask.send(text), frame(event, data));
}

async function openChat(page: Page) {
  const email = await clerkEmail();
  if (!email)
    return false;

  await page.route(new URL('/v1/me', apiUrl()).href, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(memberProfile),
    });
  });
  await stubAskStream(page);
  await page.goto('/sign-in');
  await clerk.signIn({ page, emailAddress: email });
  await page.goto('/');
  await expect(page.getByLabel('Ask a question')).toBeVisible();
  return true;
}

test.describe('chat', () => {
  test.beforeAll(async () => {
    test.skip(!process.env.CLERK_SECRET_KEY, 'Clerk secret is not configured');
    await clerkSetup();
  });

  test('asks, shows progress, streamed text, sources and the origin badge; reload clears it', async ({ page }) => {
    test.skip(!await openChat(page), 'No Clerk test user is available');

    await expect(page.getByText('How can I help?')).toBeVisible();
    const box = page.getByLabel('Ask a question');
    await box.fill('How do I set up the VPN?');
    await box.press('Enter');

    await expect(page.getByText('How do I set up the VPN?')).toBeVisible();
    await expect(box).toHaveValue('');
    await expect.poll(() => page.evaluate(() => window.__ask.requests)).toEqual(['How do I set up the VPN?']);

    await send(page, 'status', { stage: 'searching_kb' });
    await expect(page.getByRole('status').filter({ hasText: 'Searching the knowledge base' })).toBeVisible();

    await send(page, 'citations', {
      sources: [
        {
          n: 1,
          kind: 'kb',
          documentId: 'doc-1',
          filename: 'vpn.md',
        },
        {
          n: 2,
          kind: 'web',
          title: 'Vendor guide',
          url: 'https://example.com/vpn',
        },
      ],
    });
    await send(page, 'token', { text: 'Install the client ' });
    await expect(page.getByText('Install the client')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Searching the knowledge base' })).toHaveCount(0);

    await send(page, 'token', { text: 'then sign in.' });
    await expect(page.getByText('Install the client then sign in.')).toBeVisible();
    await send(page, 'done', { answerSource: 'kb', sourceConfidence: 'high' });

    await expect(page.getByText('From company documents')).toBeVisible();
    await expect(page.getByText('High confidence')).toBeVisible();
    await expect(page.getByText('vpn.md')).toBeVisible();
    const link = page.getByRole('link', { name: /Vendor guide/ });
    await expect(link).toHaveAttribute('href', 'https://example.com/vpn');
    await expect(link).toHaveAttribute('target', '_blank');

    await page.reload();
    await expect(page.getByText('How can I help?')).toBeVisible();
    await expect(page.getByText('Install the client then sign in.')).toHaveCount(0);
  });

  test('stops mid-answer, keeps the text, and allows a new question', async ({ page }) => {
    test.skip(!await openChat(page), 'No Clerk test user is available');

    const box = page.getByLabel('Ask a question');
    await box.fill('Long question');
    await box.press('Enter');
    await send(page, 'token', { text: 'Partial answer' });
    await expect(page.getByText('Partial answer')).toBeVisible();

    await expect.poll(() => page.evaluate(() => window.__ask.requests)).toEqual(['Long question']);

    // Enter does not submit while busy.
    await box.fill('Second');
    await box.press('Enter');
    expect(await page.evaluate(() => window.__ask.requests)).toEqual(['Long question']);

    await page.getByRole('button', { name: 'Stop answering' }).click();

    await expect(page.getByText('Stopped. This answer may be incomplete.')).toBeVisible();
    await expect(page.getByText('Partial answer')).toBeVisible();
    expect(await page.evaluate(() => window.__ask.aborted)).toBe(true);
    await expect(page.getByRole('button', { name: 'Stop answering' })).toHaveCount(0);

    await box.press('Enter');
    await expect.poll(() => page.evaluate(() => window.__ask.requests)).toEqual(['Long question', 'Second']);
  });

  test('shows a friendly error without raw text, then retries the same question', async ({ page }) => {
    test.skip(!await openChat(page), 'No Clerk test user is available');

    await page.evaluate(() => {
      window.__ask.mode = 'reject';
    });
    const box = page.getByLabel('Ask a question');
    await box.fill('Will fail');
    await box.press('Enter');

    const alert = page.getByRole('article').getByRole('alert');
    await expect(alert).toContainText('Something went wrong on our side');
    await expect(page.getByText('Reference: req-e2e-500')).toBeVisible();
    await expect(page.getByText('Internal detail that must not be shown')).toHaveCount(0);

    await page.evaluate(() => {
      window.__ask.mode = 'stream';
    });
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect.poll(() => page.evaluate(() => window.__ask.requests)).toEqual(['Will fail', 'Will fail']);

    await send(page, 'token', { text: 'Recovered.' });
    await send(page, 'done', { answerSource: 'direct', sourceConfidence: 'not_applicable' });
    await expect(page.getByText('Recovered.')).toBeVisible();
    await expect(alert).toHaveCount(0);
  });

  test('treats a stream that closes early as a failure with partial text kept', async ({ page }) => {
    test.skip(!await openChat(page), 'No Clerk test user is available');

    const box = page.getByLabel('Ask a question');
    await box.fill('Cut off');
    await box.press('Enter');
    await send(page, 'token', { text: 'Half an ans' });
    await page.evaluate(() => window.__ask.close());

    await expect(page.getByText('Half an ans')).toBeVisible();
    await expect(page.getByText('This answer is incomplete.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  });
});
