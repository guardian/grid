import type { APIRequestContext, Page } from '@playwright/test';
import { Given, Then, KAHUNA_APP_URL, expect } from '../setup.ts';
import { findSeededImageId, hasNoUsageRights, loadImageFixtures } from '../../setup/image-fixtures.ts';
import { usageRightsCategories } from '../utils/api/metadata-editor.queries.ts';
import { setTestClientConfig } from '../utils/test-config.ts';

/** An image seeded into Elasticsearch from fixtures/elasticsearch/images.json. */
const SEEDED_IMAGE_ID = findSeededImageId('with no usage rights category', hasNoUsageRights);

const imageInformation = (page: Page) => page.getByRole('complementary', { name: 'Image information' });
const rightsAndRestrictions = (page: Page) =>
  page.getByRole('region', { name: 'Rights and restrictions', exact: true });
const usageSummary = (page: Page) => rightsAndRestrictions(page).locator('usage-rights-summary');

async function openImage(page: Page, imageId: string): Promise<void> {
  await page.goto(`${KAHUNA_APP_URL}/images/${imageId}`);
  await expect(imageInformation(page)).toBeVisible();
}

async function openSummaryImage(page: Page, imageId: string, cost: 'pay' | 'free'): Promise<void> {
  const response = page.waitForResponse((response) =>
    new URL(response.url()).pathname === `/images/${imageId}` &&
    response.request().resourceType() === 'xhr',
  );
  await openImage(page, imageId);
  const imageResponse = await response;
  expect(imageResponse.ok(), 'fetching the summary image').toBeTruthy();
  const { data } = (await imageResponse.json()) as { data: { cost: string } };
  expect(data.cost, 'the summary image has the expected cost').toBe(cost);
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

Given('the usage rights summary is switched on', async ({ page }) => {
  await expect(usageSummary(page)).toBeVisible();
});

Given('the usage rights summary is switched off', async ({ page }) => {

 await setTestClientConfig(page, { usageRightsSummary: false });
  // The metadata controller reads the switch on creation; same-document navigation recreates it.
  const imageUrl = page.url();
  await page.getByRole('link', { name: 'Go to image search' }).click();
  await expect(rightsAndRestrictions(page)).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(imageUrl);
  await expect(rightsAndRestrictions(page)).toBeVisible();
});

Given('the image is payable', async ({ page }) => {
  await openSummaryImage(page, findSeededImageId(
    'with payable usage rights',
    (source) => source.usageRights?.category === 'pay-to-use' && !source.usageRights.restrictions,
  ), 'pay');
});

Given('the image is unrestricted, free and credited to the BBC', async ({ page }) => {
  await openSummaryImage(page, findSeededImageId(
    'with unrestricted, free BBC rights',
    (source) => source.usageRights?.category === 'public-domain' && source.metadata?.credit === 'BBC',
  ), 'free');
});

Given('the image is free and in the {string} usage rights category', async ({ page }, category: string) => {
  await openSummaryImage(page, findSeededImageId(
    `with free "${category}" rights`,
    (source) => source.usageRights?.category === category && source.usageRights.supplier === 'AP',
  ), 'free');
});

Given('the image is free and has the usage rights supplier {string}', async ({ page }, supplier: string) => {
  await openSummaryImage(page, findSeededImageId(
    `with free rights from "${supplier}"`,
    (source) => source.usageRights?.category === 'agency' && source.usageRights.supplier === supplier,
  ), 'free');
});

Given('the image is free, unrestricted and not credited to the BBC', async ({ page }) => {
  await openSummaryImage(page, findSeededImageId(
    'with unrestricted, free non-BBC rights',
    (source) => source.usageRights?.category === 'public-domain' &&
      !source.metadata?.credit?.toLowerCase().includes('bbc'),
  ), 'free');
});

Given('the image is not in the {string} usage rights category', async ({ page }, category: string) => {
  const imageId = new URL(page.url()).pathname.split('/').pop();
  expect(imageId).toBeDefined();
  const image = loadImageFixtures().find(({ _id }) => _id === imageId);
  if (!image) throw new Error(`The opened image "${imageId}" is not a seeded fixture`);
  expect(image._source.usageRights?.category).not.toBe(category);
});

Given('the image was uploaded by {string}', async ({ page }, uploader: string) => {
  await openImage(page, findSeededImageId(
    `uploaded by "${uploader}"`,
    (source) => source.uploadedBy === uploader,
  ));
});

Then('the rights and restrictions section shows only the category', async ({ page }) => {
  const section = rightsAndRestrictions(page);
  await expect(section.getByRole('definition')).toHaveText('Pay to use');
  await expect(usageSummary(page)).toHaveCount(0);
  await expect(section.locator('svg')).toHaveCount(0);
  await expect(section.getByRole('table')).toHaveCount(0);
});

Then('the usage rights summary lists {string} with its icon', async ({ page }, usage: string) => {
  const row = usageSummary(page).getByRole('row').filter({
    has: page.getByText(usage, { exact: true }),
  });
  await expect(row).toBeVisible();
  await expect(row.locator('svg')).toBeVisible();
});

Then(/^the usage rights summary contains exactly (\d+) usage entr(?:y|ies)$/, async ({ page }, count: string) => {
  await expect(usageSummary(page).getByRole('row')).toHaveCount(Number(count));
});

Then('the usage rights summary lists no usage', async ({ page }) => {
  await expect(usageSummary(page).getByText('PR & Third Party', { exact: true })).toBeVisible();
  await expect(usageSummary(page).getByRole('table')).toBeAttached();
  await expect(usageSummary(page).getByRole('row')).toHaveCount(0);
  await expect(usageSummary(page).locator('svg')).toHaveCount(0);
});

Then('the usage rights summary shows an agency marker titled {string}', async ({ page }, uploader: string) => {
  await expect(usageSummary(page).getByTitle(uploader, { exact: true }))
    .toHaveClass(new RegExp(`(?:^|\\s)supplier-${uploader}(?:\\s|$)`));
});

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