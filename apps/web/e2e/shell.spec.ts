import type { Page } from '@playwright/test';
import process from 'node:process';
import { clerk, clerkSetup } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';

const adminProfile = {
  userId: 'user_e2e_admin',
  displayName: 'Ada Admin',
  primaryEmail: 'ada@example.com',
  role: 'admin',
};

const unavailable = {
  type: 'https://omni-it-copilot.dev/problems/service-unavailable',
  title: 'Service unavailable',
  status: 503,
  requestId: 'req-e2e',
};

test.describe('signed-in shell', () => {
  test.beforeAll(async () => {
    test.skip(!process.env.CLERK_SECRET_KEY, 'Clerk secret is not configured');
    await clerkSetup();
  });

  test('shows the admin profile, recovers from an API failure, and stays usable across viewports', async ({ page }) => {
    const email = await clerkEmail();
    if (!email) {
      test.skip(true, 'No Clerk test user is available');
      return;
    }

    let failNext = false;
    await page.route('**/v1/me', async (route) => {
      const url = new URL(route.request().url());
      if (!url.hostname.includes('localhost') && !url.hostname.includes('127.0.0.1')) {
        await route.continue();
        return;
      }

      if (failNext) {
        failNext = false;
        await route.fulfill({
          status: 503,
          contentType: 'application/problem+json',
          body: JSON.stringify(unavailable),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(adminProfile),
      });
    });

    await page.goto('/sign-in');
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
    await clerk.signIn({ page, emailAddress: email });
    await page.goto('/');

    await expect(page.getByText('Ada Admin')).toBeVisible();
    await expect(page.getByText('Admin', { exact: true })).toBeVisible();

    failNext = true;
    await page.reload();
    await expect(page.getByRole('heading', { name: 'OmniAssist AI' })).toBeVisible();
    await expect(page.getByRole('alert')).toBeVisible();
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByText('Ada Admin')).toBeVisible();
    await expect(page.getByText('Admin', { exact: true })).toBeVisible();

    await page.setViewportSize({ width: 360, height: 800 });
    const phoneOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth - document.documentElement.clientWidth;
    });
    expect(phoneOverflow).toBeLessThanOrEqual(1);
    await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeHidden();

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open navigation' })).toBeHidden();

    await page.setViewportSize({ width: 360, height: 800 });
    await expectVisibleFocus(page, 'Open navigation');
    await expectVisibleFocus(page, 'Theme');
    await expectVisibleFocus(page, /user/i);
  });
});

async function clerkEmail(): Promise<string | undefined> {
  if (process.env.E2E_CLERK_USER_EMAIL)
    return process.env.E2E_CLERK_USER_EMAIL;

  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret)
    return undefined;

  const response = await fetch('https://api.clerk.com/v1/users?limit=50', {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!response.ok)
    return undefined;

  const users = await response.json() as Array<{
    public_metadata?: { role?: string };
    email_addresses?: Array<{ email_address?: string }>;
  }>;
  const admin = users.find(user => user.public_metadata?.role === 'admin') ?? users[0];
  return admin?.email_addresses?.[0]?.email_address;
}

async function expectVisibleFocus(page: Page, name: string | RegExp): Promise<void> {
  const button = page.getByRole('button', { name });
  for (let attempt = 0; attempt < 20; attempt++) {
    const focused = await button.evaluate(element => element === document.activeElement).catch(() => false);
    if (focused)
      break;
    await page.keyboard.press('Tab');
  }

  await expect(button).toBeFocused();
  const visible = await button.evaluate((element) => {
    const style = getComputedStyle(element);
    const outline = style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0;
    return outline || style.boxShadow !== 'none';
  });
  expect(visible).toBe(true);
}
