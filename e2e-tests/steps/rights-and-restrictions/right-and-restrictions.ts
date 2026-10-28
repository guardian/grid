import type { APIRequestContext, Page, Response } from '@playwright/test';
import { Given, When, Then, KAHUNA_APP_URL, expect } from '../setup.ts';
import { findSeededImage, findSeededImageId, hasNoUsageRights, loadImageFixtures } from '../../setup/image-fixtures.ts';
import { usageRightsCategories } from '../utils/api/metadata-editor.queries.ts';
import { setTestClientConfig } from '../utils/test-config.ts';
import { TEST_ACCOUNTS } from '../../setup/constants.ts';
import { switchAccount } from '../utils/auth.ts';
import { expectEditPermissionForImage, expectNoEditPermissionForImage } from '../utils/api/media-api.assertions.ts';

/** An image seeded into Elasticsearch from fixtures/elasticsearch/images.json. */
const IMAGE_WITHOUT_RIGHTS = findSeededImage('with no usage rights category', hasNoUsageRights);
const SEEDED_IMAGE_ID = IMAGE_WITHOUT_RIGHTS._id;

const imageInformation = (page: Page) => page.getByRole('complementary', { name: 'Image information' });
const rightsAndRestrictions = (page: Page) =>
  page.getByRole('region', { name: 'Rights and restrictions', exact: true });
const usageSummary = (page: Page) => rightsAndRestrictions(page).locator('usage-rights-summary');
const rightsEditor = (page: Page) => page.getByRole('form', { name: 'Image usage rights' });

/** Kahuna only reveals the edit button while the section is hovered. */
async function openRightsEditor(page: Page): Promise<void> {
  const section = rightsAndRestrictions(page);
  await section.hover();
  await section.getByRole('button', { name: '✎' }).click();
}

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

Given('I am signed in without edit metadata permission', async ({ page }) => {
  await switchAccount(page, TEST_ACCOUNTS.restricted);
});

Given('I am signed in with edit metadata permission', async ({ page }) => {
  await switchAccount(page, TEST_ACCOUNTS.fullAccess);
});

Given('the image was uploaded by me', async ({ page, testContext }) => {
  const imageId = findSeededImageId(
    'owned by the restricted account',
    (source) => source.uploadedBy === TEST_ACCOUNTS.restricted,
  );
  await openImage(page, imageId);
  testContext.permissionImage = { id: imageId, uploadedBy: TEST_ACCOUNTS.restricted };
});

Then('the edit rights and restrictions button is shown', async ({ page, testContext }) => {
  const image = testContext.permissionImage;
  if (!image) throw new Error('No image was selected by an earlier ownership step');
  await expectEditPermissionForImage(page, image.id, image.uploadedBy);
  const section = rightsAndRestrictions(page);
  await expect(section.getByRole('definition')).toContainText(/\S/);
  await section.hover();
  const button = section.getByRole('button', { name: '✎' });
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
});

When('I choose to edit the rights and restrictions', async ({ page }) => {
  await openRightsEditor(page);
});

Then('the rights editor is shown', async ({ page }) => {
  await expect(rightsEditor(page)).toBeVisible();
});

Given('I have opened the rights editor', async ({ page }) => {
  await openRightsEditor(page);
  await expect(rightsEditor(page)).toBeVisible();
});

/**
 * Values for the required properties of each category a scenario saves, keyed by category
 * display name then property label. A category's form can't be submitted without them.
 */
const REQUIRED_PROPERTY_VALUES: Record<string, Record<string, string>> = {
  'Agency - subscription': { Supplier: 'AP' },
};

/** Required and optional property values a scenario fills in before saving a category. */
const CONFIGURED_PROPERTY_VALUES: Record<string, Record<string, string>> = {
  'Agency - subscription': { Supplier: 'AP', Collection: 'News' },
};

const RESTRICTIONS_PLACEHOLDER = 'What restrictions apply to this image?';

const rightsProperty = (page: Page, property: string) =>
  rightsEditor(page).getByLabel(property, { exact: true });
const restrictedCheckbox = (page: Page) =>
  rightsEditor(page).getByRole('checkbox', { name: 'Restricted', exact: true });
// The restrictions textarea has no label of its own, only a placeholder.
const restrictionsInput = (page: Page) => rightsEditor(page).getByPlaceholder(RESTRICTIONS_PLACEHOLDER);

const imageIdFromUrl = (page: Page) => new URL(page.url()).pathname.split('/').pop();

const isUsageRightsSave = (imageId: string | undefined) => (response: Response) =>
  response.request().method() === 'PUT' &&
  new URL(response.url()).pathname === `/metadata/${imageId}/usage-rights`;

async function selectCategory(page: Page, category: string): Promise<void> {
  // The category <select> is the editor's first control and has no label of its own.
  await rightsEditor(page).getByRole('combobox').first().selectOption({ label: category });
}

/** Fill a category property, whichever control the editor renders for it. */
async function setProperty(page: Page, property: string, value: string): Promise<void> {
  const field = rightsProperty(page, property);
  const tagName = await field.evaluate((element) => element.tagName);
  if (tagName === 'SELECT') {
    await field.selectOption({ label: value });
  } else {
    await field.fill(value);
  }
}

async function expectProperty(page: Page, property: string, value: string): Promise<void> {
  const field = rightsProperty(page, property);
  const tagName = await field.evaluate((element) => element.tagName);
  // Angular's ng-options values are internal ("string:AP"), so check the chosen option's text.
  if (tagName === 'SELECT') {
    await expect(field.locator('option:checked')).toHaveText(value);
  } else {
    await expect(field).toHaveValue(value);
  }
}

async function saveRights(page: Page): Promise<void> {
  const editor = rightsEditor(page);
  // The editor closes whether or not the save succeeds, so check the requests themselves:
  // the rights, then the metadata the metadata editor derives from them.
  const imageId = imageIdFromUrl(page);
  const [rights, derivedMetadata] = await Promise.all([
    page.waitForResponse(isUsageRightsSave(imageId)),
    page.waitForResponse((response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === `/metadata/${imageId}/metadata/set-from-usage-rights`,
    ),
    editor.getByRole('button', { name: 'Save usage rights', exact: true }).click(),
  ]);
  expect(rights.ok(), `saving the rights: ${await rights.text()}`).toBeTruthy();
  expect(derivedMetadata.ok(), `deriving metadata from the rights: ${await derivedMetadata.text()}`)
    .toBeTruthy();
}

When('I save the {string} usage rights category', async ({ page }, category: string) => {
  const required = REQUIRED_PROPERTY_VALUES[category];
  if (!required) throw new Error(`No required property values are defined for "${category}"`);

  await selectCategory(page, category);
  for (const [property, value] of Object.entries(required)) {
    await setProperty(page, property, value);
  }
  await saveRights(page);
});

When('I select the {string} usage rights category', async ({ page }, category: string) => {
  await selectCategory(page, category);
});

When(
  'I select the {string} usage rights category and set configured fields',
  async ({ page, testContext }, category: string) => {
    const values = CONFIGURED_PROPERTY_VALUES[category];
    if (!values) throw new Error(`No configured property values are defined for "${category}"`);

    await selectCategory(page, category);
    for (const [property, value] of Object.entries(values)) {
      await setProperty(page, property, value);
    }
    testContext.rightsProperties = values;
  },
);

When('I set the {string} property to {string}', async ({ page }, property: string, value: string) => {
  await setProperty(page, property, value);
});

When('I add the restriction {string}', async ({ page }, restriction: string) => {
  const checkbox = restrictedCheckbox(page);
  // Categories that require restrictions tick (and lock) the checkbox themselves.
  if (!(await checkbox.isChecked())) await checkbox.check();
  await restrictionsInput(page).fill(restriction);
});

When('I save the rights', async ({ page }) => {
  await saveRights(page);
});

When('I cancel the rights editor', async ({ page }) => {
  const imageId = imageIdFromUrl(page);
  const saves: string[] = [];
  const recordSave = (response: Response) => {
    if (isUsageRightsSave(imageId)(response)) saves.push(response.url());
  };
  page.on('response', recordSave);
  try {
    await rightsEditor(page).getByRole('button', { name: 'Close usage rights form', exact: true }).click();
    await expect(rightsEditor(page)).toBeHidden();
  } finally {
    page.off('response', recordSave);
  }
  expect(saves, 'cancelling must not save the rights').toEqual([]);
});

Then(
  'the rights editor shows the {string} property as {word}',
  async ({ page }, property: string, required: string) => {
    if (required !== 'required' && required !== 'optional') {
      throw new Error(`Expected "required" or "optional", got "${required}"`);
    }
    const field = rightsProperty(page, property);
    await expect(field).toBeVisible();
    if (required === 'required') {
      await expect(field).toHaveAttribute('required');
    } else {
      await expect(field).not.toHaveAttribute('required');
    }
  },
);

Then(
  /^the rights editor shows the "Restricted" checkbox (unticked|ticked and locked)$/,
  async ({ page }, state: string) => {
    const checkbox = restrictedCheckbox(page);
    await expect(checkbox).toBeVisible();
    if (state === 'unticked') {
      await expect(checkbox).not.toBeChecked();
      await expect(checkbox).toBeEnabled();
    } else {
      await expect(checkbox).toBeChecked();
      await expect(checkbox).toBeDisabled();
    }
  },
);

Then('the rights editor shows no category properties', async ({ page }) => {
  const editor = rightsEditor(page);
  await expect(editor).toBeVisible();
  // Each category property is a labelled field; only the category <select> has no label.
  // The "Restricted" checkbox isn't a category property, so it's asserted separately.
  await expect(editor.getByRole('combobox')).toHaveCount(1);
  await expect(editor.getByRole('textbox')).toHaveCount(0);
  await expect(editor.getByRole('radio')).toHaveCount(0);
});

Then(
  /^the rights editor (shows|does not show) the "Restricted" checkbox$/,
  async ({ page }, shown: string) => {
    if (shown === 'shows') {
      await expect(restrictedCheckbox(page)).toBeVisible();
      await expect(restrictedCheckbox(page)).not.toBeChecked();
    } else {
      await expect(rightsEditor(page).getByRole('checkbox')).toHaveCount(0);
    }
  },
);

Then('the rights editor shows the configured fields', async ({ page, testContext }) => {
  const values = testContext.rightsProperties;
  if (!values) throw new Error('No property values were set by an earlier step');
  for (const [property, value] of Object.entries(values)) {
    await expectProperty(page, property, value);
  }
});

Then(
  'the rights editor shows the {string} property set to {string}',
  async ({ page }, property: string, value: string) => {
    await expectProperty(page, property, value);
  },
);

Then('the rights editor shows the restriction {string}', async ({ page }, restriction: string) => {
  await expect(restrictedCheckbox(page)).toBeChecked();
  await expect(restrictionsInput(page)).toHaveValue(restriction);
});

Then('the rights editor is not shown', async ({ page }) => {
  await expect(rightsEditor(page)).toBeHidden();
});

Then('the current usage rights category is shown', async ({ page }) => {
  // The category is the section's description (<dd>), whether or not the usage summary is on.
  await expect(rightsAndRestrictions(page).getByRole('definition')).toContainText(/\S/);
});

Then('the current usage rights category display is hidden', async ({ page }) => {
  await expect(rightsAndRestrictions(page).getByRole('definition')).toHaveCount(0);
});

Then('the edit rights and restrictions button is hidden', async ({ page }) => {
  const section = rightsAndRestrictions(page);
  await section.hover();
  await expect(section.getByRole('button', { name: '✎', includeHidden: true })).toBeHidden();
});

Then('the rights editor closes', async ({ page }) => {
  await expect(rightsEditor(page)).toBeHidden();
});

Given('the image was uploaded by someone else', async ({ page, testContext }) => {
  const image = loadImageFixtures().find(({ _source }) =>
    typeof _source.uploadedBy === 'string' &&
    !Object.values(TEST_ACCOUNTS).some((account) => account === _source.uploadedBy),
  );
  if (!image || typeof image._source.uploadedBy !== 'string') {
    throw new Error('No seeded image uploaded by someone other than the test accounts');
  }
  await openImage(page, image._id);
  testContext.permissionImage = { id: image._id, uploadedBy: image._source.uploadedBy };
});

Then('the edit rights and restrictions button is not shown', async ({ page }) => {
  const section = rightsAndRestrictions(page);
  await expect(section.getByRole('definition')).toContainText(/\S/);
  await section.hover();
  await expect(section.getByRole('button', { name: '✎', includeHidden: true })).toBeHidden();
  await expect(page.getByRole('form', { name: 'Image usage rights' })).toBeHidden();
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

// It's ok to target a css class here because non-Guardian orgs supply stylesheets that provide the appropriate imagary  
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

Given('the image has no usage rights category', async ({ page, seedImage }) => {
  // A disposable copy, so scenarios that save rights don't change a shared fixture.
  await openImage(page, await seedImage(IMAGE_WITHOUT_RIGHTS._source, { usageRights: {} }));
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