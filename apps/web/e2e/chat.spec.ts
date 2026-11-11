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
      /** Full request bodies, to check the conversation id. */
      bodies: Array<{ question: string; conversationId?: string }>;
      /** Status of the problem response while `mode` is `reject`. */
      rejectStatus: number;
      send: (frame: string) => void;
      close: () => void;
      fail: (status: number) => void;
      mode: 'stream' | 'reject';
      aborted: boolean;
    };
  }
}

/**
 * Replace `fetch` for `POST /api/v1/ask` with a stream the test feeds by hand, so progress,
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
      bodies: [],
      rejectStatus: 500,
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

      const body = JSON.parse(String(init.body)) as { question: string; conversationId?: string };
      control.requests.push(body.question);
      control.bodies.push(body);

      if (control.mode === 'reject') {
        return new Response(JSON.stringify({
          type: 'about:blank',
          title: 'Internal detail that must not be shown',
          status: control.rejectStatus,
          requestId: 'req-e2e-500',
        }), {
          status: control.rejectStatus,
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
  }, new URL('/api/v1/ask', apiUrl()).href);
}

const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

async function send(page: Page, event: string, data: unknown) {
  await page.evaluate(text => window.__ask.send(text), frame(event, data));
}

async function openChat(page: Page) {
  const email = await clerkEmail();
  if (!email)
    return false;

  await page.route(new URL('/api/v1/me', apiUrl()).href, async (route) => {
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

const CONVERSATION_ID = '550e8400-e29b-41d4-a716-446655440000';

interface StubTurn {
  id: string;
  question: string;
  answer: string;
}

/** An in-memory stand-in for `/api/v1/conversations`, so History can be driven without a database. */
async function stubConversations(page: Page, initial: Array<{ id: string; title: string; turns: StubTurn[] }> = []) {
  const store = new Map(initial.map(item => [
    item.id,
    { ...item },
  ]));
  const calls: string[] = [];
  const base = new URL('/api/v1/conversations', apiUrl()).href;

  const json = (body: unknown, status = 200) => ({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
  const summary = (item: { id: string; title: string }) => ({
    id: item.id,
    title: item.title,
    updatedAt: '2026-01-15T12:00:00.000Z',
  });

  await page.route(`${base}**`, async (route) => {
    const request = route.request();
    const method = request.method();
    if (method === 'OPTIONS') {
      await route.fallback();
      return;
    }
    const id = new URL(request.url()).pathname.split('/')[4];
    calls.push(`${method} ${id ?? 'list'}`);

    if (!id) {
      await route.fulfill(json({
        conversations: [
          ...store.values(),
        ].reverse().map(summary),
      }));
      return;
    }
    const item = store.get(id);
    if (!item) {
      await route.fulfill({
        status: 404,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          type: 'about:blank',
          title: 'Not found',
          status: 404,
          requestId: 'req-e2e-404',
        }),
      });
      return;
    }
    if (method === 'GET') {
      await route.fulfill(json({
        ...summary(item),
        turns: item.turns.map(turn => ({
          ...turn,
          answerSource: 'kb',
          sourceConfidence: 'high',
          sources: [
            {
              n: 1,
              kind: 'kb',
              documentId: 'doc-1',
              filename: 'vpn.md',
            },
          ],
          createdAt: '2026-01-15T12:00:00.000Z',
        })),
      }));
    }
    else if (method === 'PATCH') {
      item.title = (request.postDataJSON() as { title: string }).title;
      await route.fulfill(json(summary(item)));
    }
    else if (method === 'DELETE') {
      store.delete(id);
      await route.fulfill({ status: 204 });
    }
    else {
      await route.fallback();
    }
  });

  return {
    store,
    calls,
    save: (item: { id: string; title: string; turns: StubTurn[] }) => store.set(item.id, item),
  };
}

async function finishAnswer(page: Page, text: string, conversationId = CONVERSATION_ID) {
  await send(page, 'token', { text });
  await send(page, 'done', { answerSource: 'kb', sourceConfidence: 'high', conversationId });
}

test.describe('conversation history', () => {
  test.beforeAll(async () => {
    test.skip(!process.env.CLERK_SECRET_KEY, 'Clerk secret is not configured');
    await clerkSetup();
  });

  test('continues a conversation, reopens it from History, renames it, deletes it, and reload starts empty', async ({ page }) => {
    const history = await stubConversations(page);
    test.skip(!await openChat(page), 'No Clerk test user is available');

    const box = page.getByLabel('Ask a question');
    await box.fill('How do I set up the VPN?');
    await box.press('Enter');
    await expect.poll(() => page.evaluate(() => window.__ask.bodies)).toEqual([
      { question: 'How do I set up the VPN?' },
    ]);
    await finishAnswer(page, 'Install the client.');
    await expect(page.getByText('From company documents')).toBeVisible();
    history.save({
      id: CONVERSATION_ID,
      title: 'How do I set up the VPN?',
      turns: [
        { id: '650e8400-e29b-41d4-a716-446655440001', question: 'How do I set up the VPN?', answer: 'Install the client.' },
      ],
    });

    // The follow-up carries the conversation id.
    await box.fill('and on a Mac?');
    await box.press('Enter');
    await expect.poll(() => page.evaluate(() => window.__ask.bodies.at(-1))).toEqual({
      question: 'and on a Mac?',
      conversationId: CONVERSATION_ID,
    });
    await finishAnswer(page, 'Use the App Store build.');
    await expect(page.getByText('Use the App Store build.')).toBeVisible();

    // New chat empties the screen and the next question starts fresh.
    await page.getByRole('button', { name: 'New chat' }).click();
    await expect(page.getByText('How can I help?')).toBeVisible();
    await expect(page.getByRole('button', { name: 'New chat' })).toHaveCount(0);

    // Reopen it from History.
    await page.getByRole('button', { name: 'History' }).click();
    const sheet = page.getByRole('dialog', { name: 'History' });
    await expect(sheet.getByRole('list', { name: 'Saved conversations' })).toBeVisible();
    await sheet.getByRole('button', { name: /How do I set up the VPN\?/ }).first().click();
    await expect(sheet).toHaveCount(0);
    await expect(page.getByText('Install the client.')).toBeVisible();
    await expect(page.getByText('From company documents')).toBeVisible();
    await expect(page.getByText('vpn.md')).toBeVisible();

    // Asking now continues the reopened conversation.
    await box.fill('one more');
    await box.press('Enter');
    await expect.poll(() => page.evaluate(() => window.__ask.bodies.at(-1))).toEqual({
      question: 'one more',
      conversationId: CONVERSATION_ID,
    });
    await finishAnswer(page, 'Sure.');
    await expect(page.getByText('Sure.')).toBeVisible();

    // Rename inline.
    await page.getByRole('button', { name: 'History' }).click();
    await sheet.getByRole('button', { name: 'Rename How do I set up the VPN?' }).click();
    const title = sheet.getByLabel('Title for How do I set up the VPN?');
    await title.fill('   ');
    await title.press('Enter');
    await expect(sheet.getByText('Enter a title.')).toBeVisible();
    await title.fill('VPN setup');
    await title.press('Enter');
    await expect(sheet.getByText('VPN setup', { exact: true })).toBeVisible();
    expect(history.store.get(CONVERSATION_ID)?.title).toBe('VPN setup');

    // Cancelling the confirmation deletes nothing.
    await sheet.getByRole('button', { name: 'Delete VPN setup' }).click();
    await expect(sheet.getByText('Delete this conversation for good?')).toBeVisible();
    await sheet.getByRole('button', { name: 'Cancel' }).click();
    expect(history.store.has(CONVERSATION_ID)).toBe(true);

    // Deleting the open conversation returns the screen to the empty state.
    await sheet.getByRole('button', { name: 'Delete VPN setup' }).click();
    await sheet.getByRole('group', { name: /Confirm deleting VPN setup/ }).getByRole('button', { name: 'Delete' }).click();
    await expect(sheet.getByText('No saved conversations yet')).toBeVisible();
    expect(history.store.size).toBe(0);
    await page.keyboard.press('Escape');
    await expect(page.getByText('How can I help?')).toBeVisible();

    await page.reload();
    await expect(page.getByText('How can I help?')).toBeVisible();
    await expect(page.getByText('Sure.')).toHaveCount(0);
  });

  test('shows a retry when History cannot load, and says nothing is saved when it is empty', async ({ page }) => {
    let failing = true;
    const base = new URL('/api/v1/conversations', apiUrl()).href;
    await page.route(base, async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fallback();
        return;
      }
      if (failing) {
        await route.fulfill({
          status: 503,
          contentType: 'application/problem+json',
          body: JSON.stringify({
            type: 'about:blank',
            title: 'Secret upstream detail',
            status: 503,
            requestId: 'req-e2e-503',
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ conversations: [] }),
      });
    });
    test.skip(!await openChat(page), 'No Clerk test user is available');

    await page.getByRole('button', { name: 'History' }).click();
    const sheet = page.getByRole('dialog', { name: 'History' });
    await expect(sheet.getByRole('alert')).toContainText('We couldn\'t load your conversations.');
    await expect(sheet.getByText('Secret upstream detail')).toHaveCount(0);

    failing = false;
    await sheet.getByRole('button', { name: 'Try again' }).click();
    await expect(sheet.getByText('No saved conversations yet')).toBeVisible();
    await sheet.getByRole('button', { name: 'Start a chat' }).click();
    await expect(sheet).toHaveCount(0);
  });

  test('explains a full conversation and offers New chat instead of a raw error', async ({ page }) => {
    await stubConversations(page);
    test.skip(!await openChat(page), 'No Clerk test user is available');

    await page.evaluate(() => {
      window.__ask.mode = 'reject';
      window.__ask.rejectStatus = 409;
    });
    const box = page.getByLabel('Ask a question');
    await box.fill('One too many');
    await box.press('Enter');

    const alert = page.getByRole('article').getByRole('alert');
    await expect(alert).toContainText('This conversation has reached its limit');
    await expect(alert.getByRole('button', { name: 'Try again' })).toHaveCount(0);
    await alert.getByRole('button', { name: 'New chat' }).click();
    await expect(page.getByText('How can I help?')).toBeVisible();
  });

  test('keeps the toolbar and History sheet usable on a phone in light and dark', async ({ page }) => {
    const longTitle = 'Averyverylongconversationtitlewithoutspacesthatmustnotoverf';
    await stubConversations(page, [
      {
        id: CONVERSATION_ID,
        title: longTitle,
        turns: [
          { id: '650e8400-e29b-41d4-a716-446655440001', question: 'q', answer: 'a' },
        ],
      },
    ]);
    test.skip(!await openChat(page), 'No Clerk test user is available');
    await page.setViewportSize({ width: 360, height: 800 });

    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await expect(page.locator('html')).toHaveClass(scheme === 'dark'
        ? /\bdark\b/
        : /^(?!.*\bdark\b).*$/);

      const toolbar = page.getByRole('button', { name: 'History' });
      await expect(toolbar).toBeVisible();
      await toolbar.click();
      const sheet = page.getByRole('dialog', { name: 'History' });
      await expect(sheet.getByRole('button', {
        name: new RegExp(`^${longTitle}`),
      })).toBeVisible();

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      // The sheet slides in; wait for it to settle before measuring its edges.
      await expect.poll(async () => {
        const box = await sheet.boundingBox();
        return box
          ? Math.round(box.x + box.width)
          : -1;
      }).toBeLessThanOrEqual(361);
      expect((await sheet.boundingBox())!.x).toBeGreaterThanOrEqual(-1);
      const rowOverflow = await sheet.evaluate(element => element.scrollWidth - element.clientWidth);
      expect(rowOverflow).toBeLessThanOrEqual(1);

      await page.keyboard.press('Escape');
      await expect(sheet).toHaveCount(0);
    }
  });
});
