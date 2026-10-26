import type { Locator, Page } from '@playwright/test';
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
