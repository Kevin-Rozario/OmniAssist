import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

// Input sent before React hydrates is dropped, so retry until the menu opens.
async function chooseTheme(page: Page, name: 'Dark' | 'System', open: () => Promise<void>): Promise<void> {
  const item = page.getByRole('menuitemradio', { name });
  await expect(async () => {
    if (!await item.isVisible())
      await open();
    await expect(item).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await item.click();
}

test('dark theme is on the document at first paint after reload', async ({ page }) => {
  await page.goto('/sign-in');
  await chooseTheme(page, 'Dark', async () => {
    await page.getByRole('button', { name: 'Theme' }).focus();
    await page.keyboard.press('Enter');
  });
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);

  await page.addInitScript(() => {
    const paints: string[] = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        paints.push(`${entry.name}:${document.documentElement.className}`);
    }).observe({ type: 'paint', buffered: true });
    Object.defineProperty(window, '__omniPaints', { value: paints });
  });

  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);

  const paints = await page.evaluate(() => {
    return (window as unknown as { __omniPaints?: string[] }).__omniPaints ?? [];
  });
  expect(paints.some(paint => paint.startsWith('first-') && paint.includes('dark'))).toBe(true);
});

test('system theme follows prefers-color-scheme without a reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/sign-in');
  await chooseTheme(page, 'System', () => page.getByRole('button', { name: 'Theme' }).click());
  await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
});
