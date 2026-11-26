import type { Page } from '@playwright/test';

/**
 * Stop the page's clock, which a `@fake-clock` scenario installed, so timers only fire as steps
 * run it on with `page.clock.runFor`. Playwright can only pause at a time ahead of the clock, so
 * this first lets up to a second pass, as though the step had waited that long.
 */
export async function pauseClock(page: Page): Promise<void> {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 1_000);
}
