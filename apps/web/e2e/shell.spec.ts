import type { Page } from '@playwright/test';
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
    // Clerk's Frontend API also serves `/v1/me`, so match the app API's origin exactly.
    await page.route(new URL('/api/v1/me', apiUrl()).href, async (route) => {
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
    await expect(page.getByRole('link', { name: 'OmniAssist AI' })).toBeVisible();
    // Next's route announcer is also role="alert"; target the profile error only.
    await expect(page.getByRole('alert').filter({ hasText: 'Profile unavailable' })).toBeVisible();
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByText('Ada Admin')).toBeVisible();
    await expect(page.getByText('Admin', { exact: true })).toBeVisible();

    const nav = page.getByRole('navigation', { name: 'Primary' });
    await expect(page.getByRole('complementary')).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Chat' })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: 'Knowledge Base' })).toBeVisible();

    // The page content never grows wider than the 7xl column.
    await page.setViewportSize({ width: 1920, height: 1000 });
    const widths = await page.evaluate(() => ({
      main: document.querySelector('main > div')!.getBoundingClientRect().width,
      header: document.querySelector('header > div')!.getBoundingClientRect().width,
    }));
    expect(widths.main).toBeLessThanOrEqual(1280);
    expect(widths.header).toBeLessThanOrEqual(1280);

    await page.setViewportSize({ width: 360, height: 800 });
    const phoneOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth - document.documentElement.clientWidth;
    });
    expect(phoneOverflow).toBeLessThanOrEqual(1);
    await expect(page.getByRole('link', { name: 'OmniAssist AI' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Chat' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Knowledge Base' })).toBeVisible();

    await expectVisibleFocus(page, 'Theme');
    await expectVisibleFocus(page, /user/i);
  });
});

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
