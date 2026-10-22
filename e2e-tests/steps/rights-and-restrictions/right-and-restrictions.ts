import type { APIRequestContext, Page } from '@playwright/test';
import { Given, Then, KAHUNA_APP_URL, expect } from '../setup.ts';
import { findSeededImageId, hasNoUsageRights } from '../../setup/image-fixtures.ts';
import { API_KEY, SERVICE_PORTS } from '../../setup/constants.ts';

/** An image seeded into Elasticsearch from fixtures/elasticsearch/images.json. */
const SEEDED_IMAGE_ID = findSeededImageId('with no usage rights category', hasNoUsageRights);

const METADATA_EDITOR_URL = `http://localhost:${SERVICE_PORTS['metadata-editor']}`;

const imageInformation = (page: Page) => page.getByRole('complementary', { name: 'Image information' });
const rightsAndRestrictions = (page: Page) =>
  page.getByRole('region', { name: 'Rights and restrictions', exact: true });

async function openImage(page: Page, imageId: string): Promise<void> {
  await page.goto(`${KAHUNA_APP_URL}/images/${imageId}`);
  await expect(imageInformation(page)).toBeVisible();
}

interface UsageRightsCategory {
  name: string;
  value: string;
}

async function usageRightsCategories(request: APIRequestContext): Promise<UsageRightsCategory[]> {
  const response = await request.get(`${METADATA_EDITOR_URL}/usage-rights/categories`, {
    headers: { 'X-Gu-Media-Key': API_KEY },
  });
  expect(response.ok(), 'fetching the usage rights categories').toBeTruthy();
  return ((await response.json()) as { data: UsageRightsCategory[] }).data;
}

/**
 * Resolve a usage rights category from its display name ("Agency - subscription") or its
 * code, using the list Kahuna maps category codes to names with. Legacy codes ("chargeable")
 * are replaced in config and so absent from that list; they are used as given.
 */
async function usageRightsCategoryCode(request: APIRequestContext, category: string): Promise<string> {
  const categories = await usageRightsCategories(request);
  return categories.find(({ name }) => name === category)?.value ?? category;
}

Given('I have opened the single image view of an image', async ({ page }) => {
  await openImage(page, SEEDED_IMAGE_ID);
});

Given(
  'the image has the {string} usage rights category',
  async ({ page, request, testContext }, category: string) => {
    const code = await usageRightsCategoryCode(request, category);
    testContext.usageRightsCategory = code;
    const imageId = findSeededImageId(
      `in the "${category}" usage rights category`,
      (source) => source.usageRights?.category === code,
    );
    await openImage(page, imageId);
  },
);

Given('the usage rights suppliers is {string}', async ({ page, testContext }, suppliers: string) => {
  const category = testContext.usageRightsCategory;
  expect(category, 'no usage rights category was chosen by an earlier step').toBeDefined();
  const imageId = findSeededImageId(
    `in the "${category}" usage rights category with suppliers "${suppliers}"`,
    (source) => source.usageRights?.category === category && source.usageRights?.suppliers === suppliers,
  );
  await openImage(page, imageId);
});

Given('the image has no usage rights category', async ({ page }) => {
  await openImage(page, SEEDED_IMAGE_ID);
});

Given('the configuration contains pay-to-use and not chargeable', async ({ request }) => {
  // media-api only remaps legacy categories to the replacements listed in `usageRights.applicable`.
  const codes = (await usageRightsCategories(request)).map(({ value }) => value);
  expect(codes).toContain('pay-to-use');
  expect(codes).not.toContain('chargeable');
});

Then('the rights and restrictions section shows {string}', async ({ page }, category: string) => {
  // The category is its own element both in the plain <dd> (usage rights summary off) and
  // inside the usage rights summary (on), so match it exactly rather than the whole line.
  await expect(rightsAndRestrictions(page).getByText(category, { exact: true })).toBeVisible();
});

Then('Source field is {string}', async ({ page }, source: string) => {
  // The view mode shows only the category; the remapped `source` is a field of the rights editor.
  // Kahuna only reveals the edit button while the section is hovered.
  const section = rightsAndRestrictions(page);
  await section.hover();
  await section.getByRole('button', { name: '✎' }).click();
  const editor = page.getByRole('form', { name: 'Image usage rights' });
  await expect(editor.getByLabel('Source', { exact: true })).toHaveValue(source);
});

Then('the Metadata tab is selected', async ({ page }) => {
  // gr-radio-list hides its radio inputs and styles their labels as the tabs. Each label holds
  // a "minimal" and a "full" copy of the text, so the hidden radio's name is "Metadata Metadata".
  const metadataTab = imageInformation(page).getByRole('radio', { name: 'Metadata', includeHidden: true });
  await expect(metadataTab).toBeChecked();
});

Then('I see a {string} region', async ({ page, testContext }, name: string) => {
  testContext.region = page.getByRole('region', { name, exact: true });
  await expect(testContext.region).toBeVisible();
});

Then('it is headed {string}', async ({ testContext }, heading: string) => {
  expect(testContext.region, 'no region was found by an earlier step').toBeDefined();
  // Kahuna heads metadata regions with the key (<dt>) of their description list.
  await expect(testContext.region!.getByRole('term').first()).toHaveText(heading);
});