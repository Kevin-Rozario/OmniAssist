import { expect, test } from '@playwright/test';

test('signed-out visit to / redirects to sign-in with a return URL', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveURL(/\/sign-in/);
  const url = new URL(page.url());
  expect(url.pathname).toBe('/sign-in');

  const returnUrl = url.searchParams.get('redirect_url');
  expect(returnUrl).toBeTruthy();
  expect(returnUrl).toContain('/');
});

test('sign-in page loads without a redirect', async ({ page }) => {
  await page.goto('/sign-in');

  // Clerk's development handshake may leave the origin and return. The app
  // itself must keep the visitor on the sign-in page.
  const url = new URL(page.url());
  expect(url.pathname).toBe('/sign-in');
  expect(url.searchParams.has('redirect_url')).toBe(false);
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
});
