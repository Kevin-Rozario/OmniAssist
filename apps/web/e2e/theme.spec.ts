import { expect, test } from '@playwright/test';

test('dark theme is on the document at first paint after reload', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Theme' }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitemradio', { name: 'Dark' }).click();
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
  await page.getByRole('button', { name: 'Theme' }).click();
  await page.getByRole('menuitemradio', { name: 'System' }).click();
  await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
});
