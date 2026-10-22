import type { Page } from '@playwright/test';
import { Given, Then, KAHUNA_APP_URL, expect } from '../setup.ts';

/** An image seeded into Elasticsearch from fixtures/elasticsearch/images.json. */
const SEEDED_IMAGE_ID = 'f6bfd2f0e54c232fd642237dfe773bb14275b3b3';

const imageInformation = (page: Page) => page.getByRole('complementary', { name: 'Image information' });

Given('I have opened the single image view of an image', async ({ page }) => {
  await page.goto(`${KAHUNA_APP_URL}/images/${SEEDED_IMAGE_ID}`);
  await expect(imageInformation(page)).toBeVisible();
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