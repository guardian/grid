import { randomBytes } from 'node:crypto';
import type { Locator, Page, Response } from '@playwright/test';
import { Given, When, Then, KAHUNA_APP_URL, expect } from '../setup.ts';
import type { SeedImage, TestContext } from '../setup.ts';
import { findSeededImage, hasNoUsageRights } from '../../setup/image-fixtures.ts';
import type { ImageSource } from '../../setup/image-fixtures.ts';
import { DOMAIN } from '../../setup/constants.ts';
import { E2E_METADATA_FIELD_TEMPLATES } from '../../setup/config.ts';
import { isSearchRun } from '../search/search-box.ts';
import { chooseMetadataTemplate, expectMetadataTemplateOffered } from '../utils/metadata-templates.ts';

type Field = 'title' | 'description';
interface ImageMetadata {
  title?: string;
  description?: string;
  [key: string]: unknown;
}

/** Uploaded by someone other than the test accounts, so only full access may edit it. */
const SOURCE_IMAGE = findSeededImage('with no usage rights category', hasNoUsageRights)._source;
const SOURCE_METADATA = SOURCE_IMAGE.metadata as ImageMetadata;

const FIELD_TERMS: Record<Field, string> = { title: 'Title', description: 'Description' };

const asField = (field: string): Field => {
  if (field !== 'title' && field !== 'description') {
    throw new Error(`Expected "title" or "description", got "${field}"`);
  }
  return field;
};

// ---------------------------------------------------------------------------
// Locators
// ---------------------------------------------------------------------------

const titleRegion = (page: Page): Locator => page.getByRole('region', { name: 'Title', exact: true });

/** The title or description line, found by its <dt> term; both live in the "Title" region. */
const metadataLine = (page: Page, field: Field): Locator =>
  titleRegion(page)
    .locator('.image-info__wrap')
    .filter({ has: page.getByRole('term').filter({ hasText: new RegExp(`^\\s*${FIELD_TERMS[field]}\\s*$`) }) });

/** The value a line shows. Kahuna renders empty <dd>s alongside the one with text. */
const shownValue = (page: Page, field: Field): Locator =>
  metadataLine(page, field).getByRole('definition').filter({ hasText: /\S/ });

const editButton = (page: Page, field: Field): Locator =>
  metadataLine(page, field).getByRole('button', { name: '✎', includeHidden: true });

const editor = (page: Page, field: Field): Locator => metadataLine(page, field).getByRole('textbox');

const editorButton = (page: Page, field: Field, name: string): Locator =>
  metadataLine(page, field).getByRole('button', { name });

/** The template preview; only the preview <dd>s carry these classes (gr-image-metadata.html). */
const preview = (page: Page, field: Field): Locator =>
  metadataLine(page, field).locator(`.image-info__${field}-preview`);

const titleSearchLink = (page: Page, title: string): Locator =>
  titleRegion(page).getByRole('link', { name: `Search images by ${title} title`, exact: true });

/** gr-radio-list hides each radio and shows its label, which holds a minimal and full copy. */
const descriptionOption = (page: Page, option: string): Locator =>
  metadataLine(page, 'description').getByRole('radio', { name: option, includeHidden: true });
const descriptionOptionLabel = (page: Page, option: string): Locator =>
  metadataLine(page, 'description').locator('gr-radio-list label').filter({ hasText: option });

const searchResult = (page: Page, id: string): Locator =>
  page
    .getByRole('main', { name: 'Image search results' })
    .getByRole('listitem')
    .filter({ has: page.locator(`a[href="/images/${id}"]`) });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Index a disposable copy of an image with `metadata` merged over the source's. `seedImage`
 * records its id for later steps. Copies are uploaded "now" so they sort first in search results.
 */
async function seedImageWithMetadata(seedImage: SeedImage, metadata: ImageMetadata): Promise<string> {
  const merged: ImageMetadata = { ...SOURCE_METADATA, ...metadata };
  for (const key of Object.keys(merged)) {
    if (merged[key] === undefined) delete merged[key];
  }
  return seedImage(SOURCE_IMAGE, {
    metadata: merged as ImageSource['metadata'],
    originalMetadata: merged,
    uploadTime: new Date().toISOString(),
  });
}

function seededImageIds(testContext: TestContext, count?: number): string[] {
  const ids = testContext.seededImageIds;
  if (ids.length === 0 || (count !== undefined && ids.length !== count)) {
    throw new Error(`Expected ${count ?? 'some'} image(s) seeded by an earlier step, got ${ids.length}`);
  }
  return ids;
}

async function openSingleImageView(page: Page, testContext: TestContext): Promise<void> {
  const [id] = seededImageIds(testContext, 1);
  await page.goto(`${KAHUNA_APP_URL}/images/${id}`);
  await expect(page.getByRole('complementary', { name: 'Image information' })).toBeVisible();
  await expect(titleRegion(page)).toBeVisible();
}

/** Search for `query` and wait until every seeded image is among the results. */
async function showInSearchResults(page: Page, testContext: TestContext, query: string): Promise<void> {
  const searched = page.waitForRequest(isSearchRun);
  // The copies are payable, which Kahuna's default "free only" search filters out.
  await page.goto(`${KAHUNA_APP_URL}/search?query=${encodeURIComponent(query)}&nonFree=true`);
  await searched;
  for (const id of seededImageIds(testContext)) {
    await expect(searchResult(page, id)).toBeVisible();
  }
}

async function selectSearchResults(page: Page, testContext: TestContext, count: number): Promise<void> {
  const ids = seededImageIds(testContext, count);
  for (const [index, id] of ids.entries()) {
    const result = searchResult(page, id);
    await result.hover();
    if (index === 0) {
      // The checkbox itself is hidden; its icon label, revealed on hover, is what users click.
      await result.locator('label').filter({ hasText: 'check_box' }).click();
    } else {
      // Once an image is selected, clicking another's preview adds it to the selection.
      await result.locator('ui-preview-image').click();
    }
    await expect(result.getByRole('checkbox', { includeHidden: true })).toBeChecked();
  }
  // The info panel showing the selection starts collapsed on the search page.
  await page.getByRole('button', { name: 'Show info panel' }).click();
  await expect(titleRegion(page)).toBeVisible();
}

/** Kahuna only reveals a line's edit button while it is hovered. */
async function openEditor(page: Page, field: Field): Promise<void> {
  await metadataLine(page, field).hover();
  await editButton(page, field).click();
  await expect(editor(page, field)).toBeVisible();
}

const isMetadataSave = (id: string) => (response: Response) => {
  const url = new URL(response.url());
  return (
    response.request().method() === 'PUT' &&
    url.hostname === `media-metadata.${DOMAIN}` &&
    url.pathname === `/metadata/${id}/metadata`
  );
};

/** Run `save` and check the metadata editor accepted the save of every seeded image. */
async function expectSavesAccepted(page: Page, testContext: TestContext, save: () => Promise<void>): Promise<void> {
  const ids = seededImageIds(testContext);
  const [responses] = await Promise.all([
    Promise.all(ids.map((id) => page.waitForResponse(isMetadataSave(id)))),
    save(),
  ]);
  for (const response of responses) {
    expect(response.ok(), `saving ${response.url()}: ${await response.text()}`).toBeTruthy();
  }
}

/** Run `act` and check it sent no metadata save for any seeded image. */
async function expectNoSaves(page: Page, testContext: TestContext, act: () => Promise<void>): Promise<void> {
  const ids = seededImageIds(testContext);
  const saves: string[] = [];
  const recordSave = (response: Response) => {
    if (ids.some((id) => isMetadataSave(id)(response))) saves.push(response.url());
  };
  page.on('response', recordSave);
  try {
    await act();
  } finally {
    page.off('response', recordSave);
  }
  expect(saves, 'cancelling must not save the metadata').toEqual([]);
}

/** The image's metadata as media-api serves it, which reflects an edit once thrall has applied it. */
async function storedMetadata(page: Page, id: string): Promise<ImageMetadata> {
  const response = await page.request.get(`https://api.media.${DOMAIN}/images/${id}`);
  expect(response.ok(), `fetching image ${id}`).toBeTruthy();
  const { data } = (await response.json()) as { data: { metadata: ImageMetadata } };
  return data.metadata;
}

async function expectStoredValues(page: Page, testContext: TestContext, field: Field, values: string[]): Promise<void> {
  const ids = seededImageIds(testContext, values.length);
  await expect
    .poll(async () => Promise.all(ids.map(async (id) => (await storedMetadata(page, id))[field])))
    .toEqual(values);
}

/** The name of the template that sets exactly `fields`, replacing the image's values. */
function findTemplate(fields: Partial<Record<Field, string>>): string {
  const wanted = Object.entries(fields);
  const template = E2E_METADATA_FIELD_TEMPLATES.find(
    (t) =>
      t.fields.length === wanted.length &&
      wanted.every(([name, value]) => t.fields.some((f) => f.name === name && f.value === value)),
  );
  if (!template) {
    throw new Error(`No metadata template in setup/config.ts sets exactly ${JSON.stringify(fields)}`);
  }
  return template.templateName;
}

async function selectTemplate(page: Page, testContext: TestContext): Promise<void> {
  const name = testContext.metadataTemplateName;
  if (!name) throw new Error('No metadata template was chosen by an earlier step');
  await expectMetadataTemplateOffered(page, name);
  await chooseMetadataTemplate(page, name);
}

async function expectHighlightedPreview(page: Page, field: Field, value: string): Promise<void> {
  const shown = preview(page, field);
  await expect(shown).toHaveText(value);
  // Previews are outlined in amber (main.css) so they stand out from saved values.
  await expect(shown).toHaveCSS('border-top-color', 'rgb(255, 188, 1)');
}

const newToken = () => `e2e${randomBytes(6).toString('hex')}`;

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

Given(
  'the image has the title {string} and the description {string}',
  async ({ seedImage }, title: string, description: string) => {
    await seedImageWithMetadata(seedImage, { title, description });
  },
);

Given('the image has the title {string}', async ({ seedImage }, title: string) => {
  await seedImageWithMetadata(seedImage, { title });
});

Given('the image has the description {string}', async ({ seedImage }, description: string) => {
  await seedImageWithMetadata(seedImage, { description });
});

Given('the image has no title and no description', async ({ seedImage }) => {
  await seedImageWithMetadata(seedImage, { title: undefined, description: undefined });
});

Given(
  '{int} images with different titles and different descriptions are shown in search results',
  async ({ page, seedImage, testContext }, count: number) => {
    // A token unique to this scenario, so its search finds only the images it seeded.
    const token = newToken();
    for (let i = 1; i <= count; i++) {
      await seedImageWithMetadata(seedImage, {
        title: `Title ${i} ${token}`,
        description: `Description ${i} ${token}`,
      });
    }
    await showInSearchResults(page, testContext, token);
  },
);

Given(
  '2 images with the descriptions {string} and {string} are shown in search results',
  async ({ page, seedImage, testContext }, first: string, second: string) => {
    const token = newToken();
    for (const description of [first, second]) {
      await seedImageWithMetadata(seedImage, { title: `Title ${token}`, description });
    }
    await showInSearchResults(page, testContext, token);
  },
);

Given(
  'an image with the title {string} is shown in search results for {string}',
  async ({ page, seedImage, testContext }, title: string, query: string) => {
    await seedImageWithMetadata(seedImage, { title, description: `${query} in the ${title}` });
    await showInSearchResults(page, testContext, query);
  },
);

Given(
  'a metadata template sets the title {string} and the description {string}',
  async ({ testContext }, title: string, description: string) => {
    testContext.metadataTemplateName = findTemplate({ title, description });
  },
);

Given('a metadata template sets only the title {string}', async ({ testContext }, title: string) => {
  testContext.metadataTemplateName = findTemplate({ title });
});

// ---------------------------------------------------------------------------
// Navigation and selection
// ---------------------------------------------------------------------------

When('I open the single image view of the image', async ({ page, testContext }) => {
  await openSingleImageView(page, testContext);
});

Given('I have opened the single image view of the image', async ({ page, testContext }) => {
  await openSingleImageView(page, testContext);
});

When('I select both images', async ({ page, testContext }) => {
  await selectSearchResults(page, testContext, 2);
});

Given('I have selected both images', async ({ page, testContext }) => {
  await selectSearchResults(page, testContext, 2);
});

Given('I have selected the image', async ({ page, testContext }) => {
  await selectSearchResults(page, testContext, 1);
});

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

Then('I see {string} in the {string} region', async ({ page }, text: string, region: string) => {
  await expect(page.getByRole('region', { name: region, exact: true })).toContainText(text);
});

Then('I see {string} as the description', async ({ page }, description: string) => {
  await expect(shownValue(page, 'description')).toHaveText(description);
});

Then(/^the (title|description) shows "(.*)"$/, async ({ page }, field: string, value: string) => {
  await expect(shownValue(page, asField(field))).toHaveText(value);
});

async function expectEditButton(page: Page, field: Field, shown: boolean): Promise<void> {
  const line = metadataLine(page, field);
  // Wait for the line to render, so a missing button isn't just one not rendered yet.
  await expect(line).toBeVisible();
  await line.hover();
  if (shown) {
    await expect(editButton(page, field)).toBeVisible();
  } else {
    await expect(editButton(page, field)).toBeHidden();
  }
}

Then('I see an edit button for the title and for the description', async ({ page }) => {
  await expectEditButton(page, 'title', true);
  await expectEditButton(page, 'description', true);
});

Then('I do not see an edit button for the title or for the description', async ({ page }) => {
  await expectEditButton(page, 'title', false);
  await expectEditButton(page, 'description', false);
});

Then('I do not see an edit button for the description', async ({ page }) => {
  await expectEditButton(page, 'description', false);
});

Then(/^the (title|description) edit button is (shown|hidden)$/, async ({ page }, field: string, state: string) => {
  await expectEditButton(page, asField(field), state === 'shown');
});

// ---------------------------------------------------------------------------
// Searching by title
// ---------------------------------------------------------------------------

When(/^I (?:(shift|alt)-)?click the title$/, async ({ page }, modifier: string | undefined) => {
  const title = (await shownValue(page, 'title').textContent())?.trim();
  if (!title) throw new Error('The image shows no title to click');
  const modifiers = modifier === 'shift' ? ['Shift' as const] : modifier === 'alt' ? ['Alt' as const] : [];
  await titleSearchLink(page, title).click({ modifiers });
});

Then('the search results are shown for the query {string}', async ({ page }, query: string) => {
  await expect(page).toHaveURL((url) => url.pathname === '/search' && url.searchParams.get('query') === query);
  await expect(page.getByRole('main', { name: 'Image search results' })).toBeVisible();
});

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

When(/^I click the (title|description) edit button$/, async ({ page }, field: string) => {
  await openEditor(page, asField(field));
});

Then('a text field containing {string} is shown', async ({ page }, value: string) => {
  const field = editor(page, 'title');
  await expect(field).toBeVisible();
  await expect(field).toHaveJSProperty('tagName', 'INPUT');
  await expect(field).toHaveValue(value);
});

Then('a text area containing {string} is shown', async ({ page }, value: string) => {
  const field = editor(page, 'description');
  await expect(field).toBeVisible();
  await expect(field).toHaveJSProperty('tagName', 'TEXTAREA');
  await expect(field).toHaveValue(value);
});

Then('the cursor is at the end of the description', async ({ page }) => {
  const field = editor(page, 'description');
  // Kahuna moves the cursor once the description has loaded into the text area.
  await expect
    .poll(() =>
      field.evaluate((textarea: HTMLTextAreaElement) => {
        const end = textarea.value.length;
        return end > 0 && textarea.selectionStart === end && textarea.selectionEnd === end;
      }),
    )
    .toBe(true);
});

Then('{string} and {string} buttons are shown', async ({ page }, first: string, second: string) => {
  for (const name of [first, second]) {
    await expect(editorButton(page, 'description', name)).toBeVisible();
  }
});

/** Open a field's editor, replace its value, then `finish` the edit, saving if `saves`. */
async function editField(
  page: Page,
  testContext: TestContext,
  field: Field,
  value: string,
  saves: boolean,
  finish: (input: Locator) => Promise<void>,
): Promise<void> {
  await openEditor(page, field);
  const input = editor(page, field);
  await input.fill(value);
  if (saves) {
    await expectSavesAccepted(page, testContext, () => finish(input));
    // Wait for thrall to apply the edit, so the scenario's cleanup can't race it.
    await expectStoredValues(page, testContext, field, seededImageIds(testContext).map(() => value));
  } else {
    await expectNoSaves(page, testContext, async () => {
      await finish(input);
      await expect(input).toBeHidden();
    });
  }
}

When(
  /^I change the (title|description) to "(.*)" and (save|cancel)$/,
  async ({ page, testContext }, field: string, value: string, action: string) => {
    const f = asField(field);
    const button = action === 'save' ? 'Save' : 'Cancel';
    await editField(page, testContext, f, value, action === 'save', () => editorButton(page, f, button).click());
  },
);

When(
  'I change the description to {string} and click {string}',
  async ({ page, testContext }, value: string, button: string) => {
    await editField(page, testContext, 'description', value, button === 'Save', () =>
      editorButton(page, 'description', button).click(),
    );
  },
);

When(
  /^I change the description to "(.*)" and press (\S+)$/,
  async ({ page, testContext }, value: string, keys: string) => {
    // Kahuna saves the description on Ctrl/Cmd+Enter and cancels on Escape.
    await editField(page, testContext, 'description', value, keys.endsWith('Enter'), (input) => input.press(keys));
  },
);

Then(
  /^the image still has the (title|description) "(.*)" after a reload$/,
  async ({ page, testContext }, field: string, value: string) => {
    const f = asField(field);
    // Kahuna reads the image from media-api, which reflects the edit once thrall has applied it.
    await expectStoredValues(page, testContext, f, [value]);
    await page.reload();
    await expect(shownValue(page, f)).toHaveText(value);
  },
);

Then('both images have the title {string}', async ({ page, testContext }, title: string) => {
  await expectStoredValues(page, testContext, 'title', [title, title]);
});

Then(
  /^I (see|do not see) the "(.*)", "(.*)" and "(.*)" options$/,
  async ({ page }, see: string, first: string, second: string, third: string) => {
    await expect(editor(page, 'description')).toBeVisible();
    for (const option of [first, second, third]) {
      if (see === 'see') {
        await expect(descriptionOptionLabel(page, option)).toBeVisible();
      } else {
        await expect(descriptionOption(page, option)).toHaveCount(0);
      }
    }
  },
);

Then('{string} is selected', async ({ page }, option: string) => {
  await expect(descriptionOption(page, option)).toBeChecked();
});

When(
  'I enter the description {string} with the {string} option and save',
  async ({ page, testContext }, description: string, option: string) => {
    await openEditor(page, 'description');
    await editor(page, 'description').fill(description);
    await descriptionOptionLabel(page, option).click();
    await expect(descriptionOption(page, option)).toBeChecked();
    await expectSavesAccepted(page, testContext, () => editorButton(page, 'description', 'Save').click());
  },
);

Then(
  'the images have the descriptions {string} and {string}',
  async ({ page, testContext }, first: string, second: string) => {
    await expectStoredValues(page, testContext, 'description', [first, second]);
  },
);

// ---------------------------------------------------------------------------
// Metadata template preview
// ---------------------------------------------------------------------------

When('I select that metadata template', async ({ page, testContext }) => {
  await selectTemplate(page, testContext);
});

Given('I have selected that metadata template', async ({ page, testContext }) => {
  await selectTemplate(page, testContext);
  await expect(preview(page, 'title')).toBeVisible();
});

Then('{string} is shown highlighted as a title preview', async ({ page }, title: string) => {
  await expectHighlightedPreview(page, 'title', title);
});

Then('{string} is shown highlighted as a description preview', async ({ page }, description: string) => {
  await expectHighlightedPreview(page, 'description', description);
});
