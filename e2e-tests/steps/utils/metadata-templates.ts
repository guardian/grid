import type { Page } from '@playwright/test';
import { expect } from '../setup.ts';

export const metadataTemplates = (page: Page) =>
  page.getByRole('region', { name: 'Metadata templates', exact: true });

export const metadataTemplateSelect = (page: Page) =>
  metadataTemplates(page).getByRole('combobox', { name: 'Metadata template' });

/** Templates are baked into Kahuna's config at boot, so a stale stack won't list a new one. */
export async function expectMetadataTemplate(page: Page, templateName: string): Promise<void> {
  await expect(
    metadataTemplateSelect(page).getByRole('option', { name: templateName, exact: true }),
    `restart the stack if the "${templateName}" template is missing`,
  ).toHaveCount(1);
}

/**
 * Kahuna applies a template's selection once it has fetched the collections tree, which it
 * only requests on the first selection after the page loads. Waiting for that response
 * means what the selection changes is checked after the selection has been handled.
 */
export async function chooseMetadataTemplate(page: Page, templateName: string): Promise<void> {
  const [collections] = await Promise.all([
    page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.hostname.startsWith('media-collections.') && url.pathname === '/collections';
    }),
    metadataTemplateSelect(page).selectOption({ label: templateName }),
  ]);
  expect(collections.ok(), 'fetching collections for the metadata template').toBeTruthy();
}
