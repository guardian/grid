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

/**
 * Resolve a usage rights category from its display name ("Agency - subscription") or its
 * code ("chargeable"), using the list Kahuna maps category codes to names with.
 */
async function usageRightsCategoryCode(request: APIRequestContext, category: string): Promise<string> {
  const response = await request.get(`${METADATA_EDITOR_URL}/usage-rights/categories`, {
    headers: { 'X-Gu-Media-Key': API_KEY },
  });
  expect(response.ok(), 'fetching the usage rights categories').toBeTruthy();
  const { data } = (await response.json()) as { data: Array<{ name: string; value: string }> };
  const match = data.find(({ name, value }) => name === category || value === category);
  expect(match, `"${category}" is not a usage rights category`).toBeDefined();
  return match!.value;
}

Given('I have opened the single image view of an image', async ({ page }) => {
  await openImage(page, SEEDED_IMAGE_ID);
});

Given('the image has the {string} usage rights category', async ({ page, request }, category: string) => {
  const code = await usageRightsCategoryCode(request, category);
  const imageId = findSeededImageId(
    `in the "${category}" usage rights category`,
    (source) => source.usageRights?.category === code,
  );
  await openImage(page, imageId);
});

Then('the rights and restrictions section shows {string}', async ({ page }, category: string) => {
  // The category is its own element both in the plain <dd> (usage rights summary off) and
  // inside the usage rights summary (on), so match it exactly rather than the whole line.
  await expect(rightsAndRestrictions(page).getByText(category, { exact: true })).toBeVisible();
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