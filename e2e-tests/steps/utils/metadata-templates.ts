import type { Locator, Page } from '@playwright/test';
import { expect } from '../setup.ts';

export const metadataTemplates = (page: Page) =>
  page.getByRole('region', { name: 'Metadata templates', exact: true });

/**
 * The metadata template select in `scope`: the single image view's "Metadata templates" region
 * for a page, or an upload's own select for an upload job.
 */
export const metadataTemplateSelect = (scope: Page | Locator) =>
  ('page' in scope ? scope : metadataTemplates(scope)).getByRole('combobox', { name: 'Metadata template' });

/** Templates are baked into Kahuna's config at boot, so a stale stack won't list a new one. */
export async function expectMetadataTemplate(scope: Page | Locator, templateName: string): Promise<void> {
  await expect(
    metadataTemplateSelect(scope).getByRole('option', { name: templateName, exact: true }),
    `restart the stack if the "${templateName}" template is missing`,
  ).toHaveCount(1);
}

/**
 * Select `templateName` in `scope` (see metadataTemplateSelect). Kahuna applies a template's
 * selection once it has fetched the collections tree, which it fetches only once per page
 * load. The single image view fetches it on the first selection, so waiting for that response
 * means what the selection changes is checked after the selection has been handled. The
 * upload page fetches it as it loads, so a selection there is handled straight away.
 */
export async function chooseMetadataTemplate(scope: Page | Locator, templateName: string): Promise<void> {
  const select = metadataTemplateSelect(scope);
  if ('page' in scope) {
    await select.selectOption({ label: templateName });
    return;
  }
  const [collections] = await Promise.all([
    scope.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.hostname.startsWith('media-collections.') && url.pathname === '/collections';
    }),
    select.selectOption({ label: templateName }),
  ]);
  expect(collections.ok(), 'fetching collections for the metadata template').toBeTruthy();
}
