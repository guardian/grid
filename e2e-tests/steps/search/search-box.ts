import type { Locator, Page, Request } from '@playwright/test';
import { DOMAIN } from '../../setup/constants.ts';

/** Which search box Kahuna renders, chosen by the `use-cql-chips` feature switch. */
export type SearchInput = 'chips' | 'cql';

/** Kahuna's own default for `use-cql-chips` (kahuna/app/lib/FeatureSwitch.scala). */
export const DEFAULT_SEARCH_INPUT: SearchInput = 'cql';

/** The top bar region holding the search box and its filters (kahuna/public/js/search/view.html). */
export const searchRegion = (page: Page): Locator =>
  page.getByRole('region', { name: 'Image search and filters' });

/** The free-text input of the chips search box (gr-text-chip.html). */
export const chipsTextInput = (page: Page): Locator =>
  searchRegion(page).locator('[data-cy="image-search-input"]');

/** The CQL search box web component (gr-cql-input.ts). Playwright's CSS locators pierce its open shadow root. */
export const cqlInput = (page: Page): Locator => searchRegion(page).locator('cql-input');

/** The hint @guardian/cql renders inside an empty CQL search box. */
export const cqlPlaceholder = (page: Page): Locator => cqlInput(page).locator('.Cql__Placeholder');

/** The element that takes keyboard focus and holds the typed text in whichever search box is in use. */
export const searchBoxEditable = (page: Page, input: SearchInput): Locator =>
  input === 'cql' ? cqlInput(page).locator('.Cql__ContentEditable') : chipsTextInput(page);

/** Wait until whichever search box is in use has rendered. */
export async function searchBoxReady(page: Page, input: SearchInput): Promise<Locator> {
  const box = input === 'cql' ? cqlInput(page) : chipsTextInput(page);
  await box.waitFor();
  return box;
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
    url.searchParams.get('length') === '1'
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

/** Set the `use-cql-chips` feature switch cookie, read by both Kahuna's server and client. */
export async function setCqlFeatureSwitch(page: Page, on: boolean): Promise<void> {
  await page.context().addCookies([
    {
      name: 'feature-switch-use-cql-chips',
      value: String(on),
      domain: `.media.${DOMAIN}`,
      path: '/',
    },
  ]);
}
