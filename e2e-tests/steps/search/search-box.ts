import type { Locator, Page } from '@playwright/test';

/** The top bar region holding the search box and its filters (kahuna/public/js/search/view.html). */
export const searchRegion = (page: Page): Locator =>
  page.getByRole('region', { name: 'Image search and filters' });

/** The CQL search box web component (gr-cql-input.ts). Playwright's CSS locators pierce its open shadow root. */
export const cqlInput = (page: Page): Locator => searchRegion(page).locator('cql-input');

/** The hint @guardian/cql renders inside an empty CQL search box. */
export const cqlPlaceholder = (page: Page): Locator => cqlInput(page).locator('.Cql__Placeholder');

/** The CQL editor element that takes keyboard focus and holds the typed text. */
export const searchBoxEditable = (page: Page): Locator => cqlInput(page).locator('.Cql__ContentEditable');

/** Wait until the search box has rendered. */
export async function searchBoxReady(page: Page): Promise<Locator> {
  const box = cqlInput(page);
  await box.waitFor();
  return box;
}
