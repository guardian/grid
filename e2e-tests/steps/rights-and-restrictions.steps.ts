import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { Given, Then, When, expect } from './setup.ts';
import { E2E_RIGHTS_TEMPLATE } from '../setup/config.ts';
import { ELASTICSEARCH_PORT, TEST_ACCOUNTS } from '../setup/constants.ts';
import type { TestAccount } from '../setup/constants.ts';
import { KAHUNA_APP_URL } from './setup.ts';
import { signIn, switchAccount } from './common.steps.ts';
import { testImages, uniqueImage, uploadPage } from './upload/setup.ts';
import { waitForMetadataSave } from './upload/media-api.assertions.ts';

const imageUrl = (id: string) => `${KAHUNA_APP_URL}/images/${id}`;
const rightsRegion = (page: Page) =>
  page.getByRole('region', { name: 'Rights and restrictions' });
const rightsEditor = (page: Page) =>
  rightsRegion(page).getByRole('region', { name: 'Image usage rights' });
const rightsEditorButton = (page: Page) =>
  rightsRegion(page).locator('[data-cy="it-edit-usage-rights-button"]');
const templateSelect = (page: Page) =>
  page.getByRole('region', { name: 'Metadata templates' }).getByRole('combobox', {
    name: 'Metadata template',
  });

const imageIdOf = (filePath: string) =>
  createHash('sha1').update(readFileSync(filePath)).digest('hex');

async function uploadImageForCurrentUser(
  page: Page,
  testContext: {
    rightsImageOwner?: string;
    rightsImageId?: string;
    rightsCurrentAccount?: string;
  },
  owner: TestAccount,
): Promise<void> {
  const uploadedImage = uniqueImage(testImages.smaller);
  const id = imageIdOf(uploadedImage.path);

  await page.goto(`${KAHUNA_APP_URL}/upload`);
  await uploadPage(page).fileInput.setInputFiles(uploadedImage.path);
  await expect(uploadPage(page).metadataEditor).toBeVisible();

  const descriptionSaved = waitForMetadataSave(page);
  await uploadPage(page).metadataField.description.fill('Rights and restrictions e2e image');
  await uploadPage(page).metadataField.description.blur();
  await descriptionSaved;

  const creditSaved = waitForMetadataSave(page);
  await uploadPage(page).metadataField.credit.fill('E2E Test');
  await uploadPage(page).metadataField.credit.blur();
  await creditSaved;

  testContext.rightsImageOwner = owner;
  testContext.rightsCurrentAccount = owner;
  testContext.rightsImageId = id;
  await page.goto(imageUrl(id));
  await expect(page.getByRole('main', { name: 'Image view' })).toBeVisible();
}

async function ensureAccount(
  page: Page,
  testContext: {
    rightsImageId?: string;
    rightsImageOwner?: string;
    rightsCurrentAccount?: string;
  },
  account: TestAccount,
): Promise<void> {
  if (testContext.rightsCurrentAccount === account) return;

  await switchAccount(page, account);
  if (!testContext.rightsImageId) {
    throw new Error('The rights-and-restrictions image has not been created');
  }
  await page.goto(imageUrl(testContext.rightsImageId));
  testContext.rightsCurrentAccount = account;
}

async function setSummaryEnabled(page: Page, enabled: boolean): Promise<void> {
  await page.route(
    (url) => url.origin === new URL(page.url()).origin && url.pathname.startsWith('/images/'),
    async (route) => {
      const response = await route.fetch();
      const html = await response.text();
      if (!/usageRightsSummary:\s*(?:true|false),/.test(html)) {
        throw new Error('The Kahuna page did not include its usageRightsSummary configuration');
      }
      await route.fulfill({
        response,
        body: html.replace(
          /usageRightsSummary:\s*(?:true|false),/,
          `usageRightsSummary: ${enabled},`,
        ),
      });
    },
  );
  await page.reload();
  await expect(page.getByRole('main', { name: 'Image view' })).toBeVisible();
}

async function chooseCategory(page: Page, categoryName: string, supplier?: string): Promise<void> {
  const display = rightsRegion(page).locator('.image-info__title');
  if (await rightsEditorButton(page).isVisible()) {
    await rightsEditorButton(page).click();
  } else if (!(await rightsEditor(page).isVisible())) {
    throw new Error("The current user cannot edit this image's rights");
  }

  const category = rightsEditor(page).locator('[data-cy="it-rights-select"]');
  await category.selectOption({ label: categoryName });
  if (supplier) {
    await rightsEditor(page).getByLabel('Supplier').selectOption({ label: supplier });
  }
  await rightsEditor(page).getByRole('button', { name: 'Save usage rights' }).click();
  await expect(display).toContainText(categoryName === 'Unknown Rights' ? 'Unknown' : categoryName);
}

async function setOwnerForScenario(
  page: Page,
  testContext: {
    rightsImageOwner?: string;
    rightsImageId?: string;
    rightsCurrentAccount?: string;
  },
  owner: TestAccount,
  returnTo: TestAccount,
): Promise<void> {
  await switchAccount(page, owner);
  testContext.rightsCurrentAccount = owner;
  await uploadImageForCurrentUser(page, testContext, owner);
  if (returnTo !== owner) {
    await switchAccount(page, returnTo);
    await page.goto(imageUrl(testContext.rightsImageId!));
    testContext.rightsCurrentAccount = returnTo;
  }
}

Given('I am signed in through pan-domain auth', async ({ page, testContext }) => {
  await signIn(page, TEST_ACCOUNTS.restricted);
  testContext.rightsCurrentAccount = TEST_ACCOUNTS.restricted;
});

Given('I have opened the single image view of an image', async ({ page, testContext }) => {
  await uploadImageForCurrentUser(page, testContext, TEST_ACCOUNTS.restricted);
});

Given('the usage rights summary is switched off', async ({ page }) => {
  await setSummaryEnabled(page, false);
});

Given('the usage rights summary is switched on', async ({ page }) => {
  await setSummaryEnabled(page, true);
});

Given('the image has the {string} usage rights category', async ({ page, testContext }, category: string) => {
  if (category === 'chargeable') {
    const imageId = testContext.rightsImageId;
    if (!imageId) throw new Error('The current image URL has no image ID');

    const response = await fetch(
      `http://localhost:${ELASTICSEARCH_PORT}/Images_Current/_update/${imageId}?refresh=wait_for`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc: { usageRights: { category: 'chargeable' } } }),
      },
    );
    if (!response.ok) {
      throw new Error(
        `Could not prepare the legacy chargeable rights fixture: HTTP ${response.status} ${await response.text()}`,
      );
    }
    await page.reload();
    await expect(rightsRegion(page).locator('.image-info__title')).toContainText('Pay to use');

    const mediaApiUrl = await page.locator('link[rel="media-api-uri"]').getAttribute('href');
    if (!mediaApiUrl) throw new Error('Kahuna page has no media-api-uri link');
    const imageResponse = await page.request.get(`${mediaApiUrl}/images/${imageId}`);
    if (!imageResponse.ok()) {
      throw new Error(`Could not read the legacy rights image: HTTP ${imageResponse.status()}`);
    }
    const image = (await imageResponse.json()) as {
      data: { usageRights: { category: string; legacyCategory?: string } };
    };
    expect(image.data.usageRights.category).toBe('pay-to-use');
    expect(image.data.usageRights.legacyCategory).toBe('chargeable');
    return;
  }
  await chooseCategory(page, category, category === 'Agency - subscription' ? 'PA' : undefined);
});

Given('the image has no usage rights category', async ({ page }) => {
  await chooseCategory(page, 'Unknown Rights');
});

Given('the configuration contains pay-to-use and not chargeable', async ({ page }) => {
  if (!(await rightsEditor(page).isVisible())) {
    await rightsEditorButton(page).click();
  }
  const categories = rightsEditor(page).locator('[data-cy="it-rights-select"] option');
  await expect(categories.filter({ hasText: 'Pay to use' })).toHaveCount(1);
  await expect(categories.filter({ hasText: 'Chargeable supplied / on spec' })).toHaveCount(0);
  await rightsEditor(page).getByRole('button', { name: 'Close usage rights form' }).click();
});

Given(
  /^the image is (payable|unrestricted, free and credited to the BBC|free and in the "agency" usage rights category|free and has the usage rights supplier "PA"|free, unrestricted and not credited to the BBC)$/,
  async ({ page }, descriptor: string) => {
    if (descriptor === 'payable') {
      await chooseCategory(page, 'Pay to use');
    } else if (descriptor === 'unrestricted, free and credited to the BBC') {
      await chooseCategory(page, 'Public Domain');
      const credit = page.locator('[data-cy="metadata-credit"]');
      await credit.locator('[data-cy="it-edit-credit-button"]').click();
      const creditInput = credit.getByRole('textbox');
      const creditSaved = waitForMetadataSave(page);
      await creditInput.fill('BBC');
      await creditInput.press('Enter');
      await creditSaved;
      await expect(credit).toContainText('BBC');
    } else if (descriptor === 'free and in the "agency" usage rights category') {
      await chooseCategory(page, 'Agency - subscription', 'PA');
    } else if (descriptor === 'free and has the usage rights supplier "PA"') {
      await chooseCategory(page, 'Agency - subscription', 'PA');
    } else if (descriptor === 'free, unrestricted and not credited to the BBC') {
      await chooseCategory(page, 'Public Domain');
    } else {
      throw new Error(`Unsupported rights-summary image descriptor: ${descriptor}`);
    }
  },
);

Given('the image is not in the {string} usage rights category', async ({ page }, category: string) => {
  if (category !== 'agency') {
    throw new Error(`Unsupported usage-rights category exclusion: ${category}`);
  }
  await chooseCategory(page, 'Public Domain');
});

Given('the image was uploaded by {string}', async ({ page, testContext }, uploadedBy: string) => {
  if (!testContext.rightsImageId) {
    throw new Error('The rights-and-restrictions image has not been created');
  }
  await page.route(
    (url) => url.pathname.endsWith(`/images/${testContext.rightsImageId}`),
    async (route) => {
      const response = await route.fetch();
      const body = (await response.json()) as { data: Record<string, unknown> };
      body.data.uploadedBy = uploadedBy;
      await route.fulfill({ response, json: body });
    },
  );
  await page.reload();
  await expect(page.getByRole('main', { name: 'Image view' })).toBeVisible();
});

Given('I am signed in with edit metadata permission', async ({ page, testContext }) => {
  await ensureAccount(page, testContext, TEST_ACCOUNTS.fullAccess);
});

Given('I am signed in without edit metadata permission', async ({ page, testContext }) => {
  await ensureAccount(page, testContext, TEST_ACCOUNTS.restricted);
});

Given('the image was uploaded by someone else', async ({ page, testContext }) => {
  const current = testContext.rightsCurrentAccount;
  const owner = testContext.rightsImageOwner;
  if (!current || !owner) {
    throw new Error('The rights-and-restrictions image owner or current account is unknown');
  }
  if (owner !== current) return;

  const otherAccount = current === TEST_ACCOUNTS.fullAccess
    ? TEST_ACCOUNTS.restricted
    : TEST_ACCOUNTS.fullAccess;
  await setOwnerForScenario(page, testContext, otherAccount, current);
});

Given('the image was uploaded by me', async ({ page, testContext }) => {
  const current = testContext.rightsCurrentAccount;
  const owner = testContext.rightsImageOwner;
  if (!current || !owner) {
    throw new Error('The rights-and-restrictions image owner or current account is unknown');
  }
  if (owner !== current) {
    await setOwnerForScenario(page, testContext, current, current);
  }
});

Given('metadata templates are configured', async ({ page }) => {
  await expect(
    templateSelect(page).locator('option', { hasText: E2E_RIGHTS_TEMPLATE.templateName }),
  ).toHaveCount(1);
});

Given('I have opened the rights editor', async ({ page }) => {
  await rightsEditorButton(page).click();
  await expect(rightsEditor(page)).toBeVisible();
});

Given("a metadata template's usage rights are being previewed on the image", async ({ page }) => {
  await templateSelect(page).selectOption({ label: E2E_RIGHTS_TEMPLATE.templateName });
  await expect(rightsEditor(page)).toBeVisible();
});

When('I choose to edit the rights and restrictions', async ({ page }) => {
  await rightsEditorButton(page).click();
});

When('I save the {string} usage rights category', async ({ page }, category: string) => {
  await chooseCategory(page, category, category === 'Agency - subscription' ? 'PA' : undefined);
});

When('I cancel the rights editor', async ({ page }) => {
  await rightsEditor(page).getByRole('button', { name: 'Close usage rights form' }).click();
});

When('I choose a metadata template that sets a usage rights category', async ({ page }) => {
  await templateSelect(page).selectOption({ label: E2E_RIGHTS_TEMPLATE.templateName });
});

When(
  'I choose a metadata template that sets the {string} usage rights category',
  async ({ page }, _category: string) => {
    await templateSelect(page).selectOption({ label: E2E_RIGHTS_TEMPLATE.templateName });
  },
);

When('I apply the metadata template', async ({ page }) => {
  await page.getByRole('region', { name: 'Metadata templates' }).getByTitle('Apply template').click();
});

When('I cancel the metadata template', async ({ page }) => {
  await page.getByRole('region', { name: 'Metadata templates' })
    .getByRole('button', { name: 'Cancel' })
    .click();
});

Then('the Metadata tab is selected', async ({ page }) => {
  await expect(page.locator('#tabs-metadata')).toBeChecked();
});

Then('I see a {string} region', async ({ page }, name: string) => {
  await expect(page.getByRole('region', { name })).toBeVisible();
});

Then('it is headed {string}', async ({ page }, heading: string) => {
  await expect(rightsRegion(page).getByText(heading, { exact: true })).toBeVisible();
});

Then('the rights and restrictions section shows {string}', async ({ page }, category: string) => {
  await expect(rightsRegion(page).locator('.image-info__title')).toContainText(category);
});

Then("the rights and restrictions section shows the template's usage rights category", async ({ page }) => {
  await expect(rightsRegion(page).locator('.image-info__title')).toContainText('Agency - subscription');
});

Then('the rights and restrictions section shows only the category', async ({ page }) => {
  await expect(rightsRegion(page).locator('.image-info__title')).toBeVisible();
  await expect(rightsRegion(page).locator('.usage-rights-summary')).toHaveCount(0);
});

Then('no usage rights summary is shown', async ({ page }) => {
  await expect(rightsRegion(page).locator('.usage-rights-summary')).toHaveCount(0);
});

Then('the usage rights summary shows {string}', async ({ page }, category: string) => {
  await expect(rightsRegion(page).locator('.usage-rights-summary')).toContainText(category);
});

Then('the usage rights summary lists {string} with its icon', async ({ page }, usage: string) => {
  const row = rightsRegion(page).locator('.usage-rights-summary-table tr').filter({ hasText: usage });
  await expect(row).toHaveCount(1);
  await expect(row.locator('svg')).toBeVisible();
});

Then('the usage rights summary lists no usage', async ({ page }) => {
  await expect(rightsRegion(page).locator('.usage-rights-summary-table tr')).toHaveCount(0);
});

Then('the usage rights summary shows an agency marker titled {string}', async ({ page }, title: string) => {
  await expect(rightsRegion(page).locator(`[title="${title}"]`)).toBeVisible();
});

Then('the edit rights and restrictions button is shown', async ({ page }) => {
  await expect(rightsEditorButton(page)).toBeVisible();
});

Then('the edit rights and restrictions button is not shown', async ({ page }) => {
  await expect(rightsEditorButton(page)).toBeHidden();
});

Then('the rights editor is not shown', async ({ page }) => {
  await expect(rightsEditor(page)).toBeHidden();
});

Then('the current usage rights category is shown', async ({ page }) => {
  await expect(rightsRegion(page).locator('.image-info__title')).toBeVisible();
});

Then('the rights editor is shown', async ({ page }) => {
  await expect(rightsEditor(page)).toBeVisible();
});

Then('the current usage rights category display is hidden', async ({ page }) => {
  await expect(rightsRegion(page).locator('.image-info__title')).toBeHidden();
});

Then('the edit rights and restrictions button is hidden', async ({ page }) => {
  await expect(rightsEditorButton(page)).toBeHidden();
});

Then('the rights editor closes', async ({ page }) => {
  await expect(rightsEditor(page)).toBeHidden();
});

Then("the rights editor shows the template's usage rights as a locked preview", async ({ page }) => {
  await expect(rightsEditor(page)).toBeVisible();
  await expect(rightsEditor(page).locator('.ure__category-preview')).toBeVisible();
  await expect(rightsEditor(page).locator('[data-cy="it-rights-select"]')).toBeDisabled();
});

Then('the rights editor offers no save or cancel buttons', async ({ page }) => {
  await expect(rightsEditor(page).getByRole('button', { name: 'Save usage rights' })).toHaveCount(0);
  await expect(rightsEditor(page).getByRole('button', { name: 'Close usage rights form' })).toHaveCount(0);
});
