import type { Locator, Page, Request } from '@playwright/test';
import { DOMAIN } from '../../setup/constants.ts';
import { expect } from '../setup.ts';

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

export async function expectSearchBoxEmpty(page: Page): Promise<void> {
  await expect(cqlInput(page)).toHaveAttribute('value', '');
}

/**
 * Whether a request is the first media-api search the results page makes when it loads
 * (`length: 1` in kahuna/public/js/search/results.js). Paging, polling for new images
 * and the AI preview use other lengths, so each match is one search run.
 */
export function isSearchRun(request: Request): boolean {
  const url = new URL(request.url());
  return (
    url.hostname === `api.media.${DOMAIN}` &&
    url.pathname === '/images' &&
    url.searchParams.get('length') === '1' &&
    url.searchParams.get('countAll') === 'true' &&
    // AI searches' first request uses the configured result limit as `length`, which could be 1.
    // Also useAISearch is not set to 'false' for non-AI searches.
    url.searchParams.get('useAISearch') !== 'true'
  );
}

/** Start recording the `q` of every search run into `searchesRun`. Safe to call more than once. */
export function recordSearches(page: Page, testContext: { searchesRun?: string[] }): void {
  if (testContext.searchesRun) return;
  const searchesRun: string[] = [];
  testContext.searchesRun = searchesRun;
  page.on('request', (request) => {
    if (isSearchRun(request)) {
      searchesRun.push(new URL(request.url()).searchParams.get('q') ?? '');
    }
  });
}
