import process from 'node:process';
import { clerk, clerkSetup } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';
import { apiUrl } from './api-url';
import { clerkEmail } from './clerk-user';

const adminProfile = {
  userId: 'user_e2e_admin',
  displayName: 'Ada Admin',
  primaryEmail: 'ada@example.com',
  role: 'admin',
};

const memberProfile = {
  userId: 'user_e2e_member',
  displayName: 'Mo Member',
  primaryEmail: 'mo@example.com',
  role: 'member',
};

const failedDocument = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  filename: 'empty.pdf',
  contentType: 'application/pdf',
  byteSize: 2048,
  status: 'failed',
  createdAt: '2026-01-15T12:00:00.000Z',
  errorSummary: 'No extractable text',
  chunkCount: null,
};

const readyDocument = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  filename: 'vpn.md',
  contentType: 'text/markdown',
  byteSize: 512,
  status: 'ready',
  createdAt: '2026-01-15T11:00:00.000Z',
  errorSummary: null,
  chunkCount: 3,
};

test.describe('knowledge base', () => {
  test.beforeAll(async () => {
    test.skip(!process.env.CLERK_SECRET_KEY, 'Clerk secret is not configured');
    await clerkSetup();
  });

  test('admin sees the Knowledge Base nav, list, failure summary, and upload control', async ({ page }) => {
    const email = await clerkEmail();
    if (!email) {
      test.skip(true, 'No Clerk test user is available');
      return;
    }

    await page.route(new URL('/api/v1/me', apiUrl()).href, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(adminProfile),
      });
    });

    await page.route(new URL('/api/v1/documents', apiUrl()).href, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            documents: [failedDocument, readyDocument],
          }),
        });
        return;
      }

      await route.fulfill({ status: 405, body: 'Method Not Allowed' });
    });

    await page.goto('/sign-in');
    await clerk.signIn({ page, emailAddress: email });
    await page.goto('/');

    const nav = page.getByRole('navigation', { name: 'Primary' });
    await expect(nav.getByRole('link', { name: 'Knowledge Base' })).toBeVisible();
    await nav.getByRole('link', { name: 'Knowledge Base' }).click();

    await expect(page.getByRole('heading', { name: 'Knowledge Base' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upload document' })).toBeVisible();
    await expect(page.getByText('empty.pdf')).toBeVisible();
    await expect(page.getByText('Failed', { exact: true })).toBeVisible();
    await expect(page.getByText('No extractable text')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect(page.getByText('vpn.md')).toBeVisible();
    await expect(page.getByText('Ready', { exact: true })).toBeVisible();
  });

  test('member does not see Knowledge Base nav and is forbidden on the page URL', async ({ page }) => {
    const email = await clerkEmail();
    if (!email) {
      test.skip(true, 'No Clerk test user is available');
      return;
    }

    await page.route(new URL('/api/v1/me', apiUrl()).href, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(memberProfile),
      });
    });

    const documentsBase = new URL('/api/v1/documents', apiUrl()).href;
    let documentsRequested = false;
    await page.route(url => url.toString().startsWith(documentsBase), async (route) => {
      documentsRequested = true;
      await route.fulfill({
        status: 403,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          type: 'https://omni-it-copilot.dev/problems/forbidden',
          title: 'Forbidden',
          status: 403,
          requestId: 'req-e2e',
        }),
      });
    });

    await page.goto('/sign-in');
    await clerk.signIn({ page, emailAddress: email });
    await page.goto('/');

    await expect(page.getByText('Mo Member')).toBeVisible();
    await expect(page.getByText('User', { exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Knowledge Base' })).toHaveCount(0);

    await page.goto('/knowledge-base');
    await expect(page.getByRole('heading', { name: 'Knowledge Base' })).toBeVisible();
    await expect(page.getByText(/do not have permission/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upload document' })).toHaveCount(0);
    expect(documentsRequested).toBe(false);
  });
});
