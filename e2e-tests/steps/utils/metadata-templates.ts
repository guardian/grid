import type { Locator, Page } from '@playwright/test';
import { DOMAIN } from '../../setup/constants.ts';
import { expect } from '../setup.ts';

/** The single image view's metadata template controls. */
export const metadataTemplates = (page: Page): Locator =>
  page.getByRole('region', { name: 'Metadata templates', exact: true });

export const metadataTemplateSelect = (page: Page): Locator =>
  metadataTemplates(page).getByRole('combobox', { name: 'Metadata template' });

/** Templates are baked into Kahuna's config at boot, so a stale stack won't offer new ones. */
export async function expectMetadataTemplateOffered(page: Page, name: string): Promise<void> {
  await expect(
    metadataTemplateSelect(page).getByRole('option', { name, exact: true }),
    `restart the stack if the "${name}" template is missing`,
  ).toHaveCount(1);
}

/**
 * Kahuna applies a template's selection once it has fetched the collections tree, which it
 * only requests on the first selection after the page loads. Waiting for that response
 * means later steps check the page after the selection has been handled.
 */
export async function chooseMetadataTemplate(page: Page, name: string): Promise<void> {
  const [collections] = await Promise.all([
    page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.hostname === `media-collections.${DOMAIN}` && url.pathname === '/collections';
    }),
    metadataTemplateSelect(page).selectOption({ label: name }),
  ]);
  expect(collections.ok(), 'fetching collections for the metadata template').toBeTruthy();
}
