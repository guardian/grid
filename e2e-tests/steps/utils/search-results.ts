import type { Locator, Page } from '@playwright/test';

export const searchResults = (page: Page): Locator =>
  page.getByRole('region', { name: 'Matched image search results' });

/**
 * Search results' cards: the list items holding a thumbnail. The pop-out link each holds,
 * shown on hover, sits in a list item of its own, which has none.
 */
export const resultCards = (page: Page): Locator =>
  searchResults(page).getByRole('listitem').filter({ has: page.getByRole('img') });

/** The card of `imageId`, found by its pop-out link, which is there even while selecting. */
export const resultCard = (page: Page, imageId: string): Locator =>
  resultCards(page).filter({ has: page.locator(`a[href="/images/${imageId}"]`) });

/** The search page's info panel, which shows the selected images' metadata. */
export const searchInfoPanel = (page: Page): Locator =>
  page.getByRole('region', { name: 'Image information' });
