import { Given, Then, When, expect } from '../setup.ts';
import type { DataTable } from 'playwright-bdd';
import type { Locator, Page } from '@playwright/test';
import { E2E_IMAGE_TYPES, E2E_METADATA_TEMPLATE, E2E_USAGE_INSTRUCTIONS } from '../../setup/config.ts';
import { TEST_ACCOUNTS } from '../../setup/constants.ts';
import { E2E_COLLECTION } from '../../setup/seed-collections.ts';
import { openUploadPage } from '../common.steps.ts';
import { expectNoEditPermission, waitForMetadataSave } from './media-api.assertions.ts';
import { grouping, testImages, uniqueImage, uploadPage } from './setup.ts';

/** Upload a unique image and wait for it to become the required-metadata editor. */
async function uploadAndOpenEditor(page: Page): Promise<void> {
  await uploadPage(page).fileInput.setInputFiles(uniqueImage().path);
  await expect(uploadPage(page).metadataEditor).toBeVisible();
}

const BATCH_FIELDS: Record<
  string,
  { input: (editor: Locator) => Locator; applyTitle: string; value: string; isSelect?: boolean }
> = {
  'Image type': {
    input: (editor) => editor.locator('select[name="imageType"]'),
    applyTitle: 'Apply this image type to all your current uploads',
    value: E2E_IMAGE_TYPES[0],
    isSelect: true,
  },
  Description: {
    input: (editor) => editor.locator('textarea[name="description"]'),
    applyTitle: 'Apply this description to all your current uploads',
    value: 'Batch description',
  },
  Byline: {
    input: (editor) => editor.locator('input[name="byline"]'),
    applyTitle: 'Apply this byline to all your current uploads',
    value: 'Batch byline',
  },
  Credit: {
    input: (editor) => editor.locator('[data-cy="image-metadata-credit"]'),
    applyTitle: 'Apply this credit to all',
    value: 'Batch credit',
  },
  'Special instructions': {
    input: (editor) => editor.locator('input[name="special-instructions"]'),
    applyTitle: 'Apply these instructions to all your current uploads',
    value: 'Batch instructions',
  },
};

const usageRights = (job: Locator) => job.getByRole('region', { name: 'Image usage rights' });

/** Fields in the image-editor around the required-metadata form; `job` is one current upload. */
const IMAGE_EDITOR_FIELDS: Record<
  string,
  {
    value: string;
    set: (job: Locator, value: string) => Promise<void>;
    applyButton: (job: Locator) => Locator;
    expectOn: (job: Locator, value: string) => Promise<void>;
  }
> = {
  Leases: {
    value: 'e2e batch lease',
    set: async (job, value) => {
      await usageRights(job).getByRole('button', { name: 'Add lease to image' }).click();
      // Deny syndication needs no dates, so the form is just access type and notes.
      await usageRights(job)
        .getByRole('combobox')
        .filter({ hasText: 'Please select access' })
        .selectOption('deny-syndication');
      await usageRights(job).getByPlaceholder('Notes...').fill(value);
      await usageRights(job).getByTitle('Save new lease').click();
    },
    applyButton: (job) =>
      usageRights(job).getByRole('button', { name: 'Apply these leases to all current uploads' }),
    expectOn: (job, value) => expect(usageRights(job).getByText(value)).toBeVisible(),
  },
  Collections: {
    value: E2E_COLLECTION,
    set: async (job, value) => {
      await grouping(job).getByRole('button', { name: 'Add image to a collection' }).click();
      await grouping(job).getByRole('button', { name: value, exact: true }).click();
    },
    applyButton: (job) => grouping(job).getByTitle('Apply these collections to all your current uploads'),
    expectOn: (job, value) =>
      expect(grouping(job).getByRole('link', { name: value, exact: true })).toBeVisible(),
  },
  Labels: {
    value: 'e2e-batch-label',
    set: async (job, value) => {
      await grouping(job).getByRole('button', { name: 'Add label to image' }).click();
      await grouping(job).locator('[data-cy="label-input"]').fill(value);
      await grouping(job).getByTitle('Save new label').click();
    },
    applyButton: (job) => grouping(job).getByTitle('Apply these labels to all your current uploads'),
    expectOn: (job, value) =>
      expect(grouping(job).getByRole('link', { name: value, exact: true })).toBeVisible(),
  },
  Keywords: {
    value: 'e2e-batch-keyword',
    set: async (job, value) => {
      await grouping(job).getByRole('button', { name: 'Add keywords to image' }).click();
      await grouping(job).locator('[data-cy="keyword-input"]').fill(value);
      await grouping(job).getByTitle('Save new keyword').click();
    },
    applyButton: (job) => grouping(job).getByTitle('Apply these keywords to all your current uploads'),
    expectOn: (job, value) =>
      expect(grouping(job).getByRole('link', { name: value, exact: true })).toBeVisible(),
  },
  Photoshoot: {
    value: 'e2e-batch-photoshoot',
    set: async (job, value) => {
      const input = grouping(job).locator('input[name="photoshoot"]');
      await input.fill(value);
      await input.blur();
    },
    applyButton: (job) => grouping(job).getByTitle('Apply this photoshoot to all your current uploads'),
    expectOn: (job, value) =>
      expect(grouping(job).locator('input[name="photoshoot"]')).toHaveValue(value),
  },
};

Given('an uploaded image is shown in the metadata editor', async ({ page }) => {
  await uploadAndOpenEditor(page);
});

Given('an uploaded image with no description', async ({ page }) => {
  await uploadAndOpenEditor(page);
});

Given(
  'an uploaded image with the following embedded metadata:',
  async ({ page, testContext }, table: DataTable) => {
    testContext.expectedMetadata = Object.fromEntries(
      table.hashes().map((row) => [row.field, row.value]),
    );
    // A unique copy of the fixture that carries the embedded IPTC (metadata lives up front,
    // so the random trailing bytes that dodge dedupe don't disturb it).
    await uploadPage(page).fileInput.setInputFiles(uniqueImage(testImages.withMetadata).path);
    await expect(uploadPage(page).metadataEditor).toBeVisible();
  },
);

// Precondition satisfied by the e2e stack config (see E2E_IMAGE_TYPES in setup/config.ts).
Given('image types are configured', async () => {});

// The `agency` usageRights category from the AAP-credited fixture triggers usageInstructions.
Given('an uploaded image that already has usage instructions', async ({ page }) => {
  await uploadPage(page).fileInput.setInputFiles(uniqueImage(testImages.agency).path);
  await expect(uploadPage(page).metadataEditor).toBeVisible();
});

When('I view the description field', async ({ page }) => {
  await expect(uploadPage(page).metadataField.description).toBeVisible();
});

When('I view the metadata editor', async ({ page }) => {
  // Idempotent: some scenarios upload in a prior Given; only upload if no editor is present yet.
  const editor = uploadPage(page);
  if (!(await editor.metadataEditor.isVisible())) {
    await editor.fileInput.setInputFiles(uniqueImage().path);
  }
  await expect(editor.metadataEditor).toBeVisible();
});

Then(
  'I should see placeholder guidance about who, what, where, when and why',
  async ({ page }) => {
    await expect(uploadPage(page).metadataField.description).toHaveAttribute(
      'placeholder',
      /who, what, where, when and why/,
    );
  },
);

Then('I should see the metadata values in the appropriate fields', async ({ page, testContext }) => {
  const fields = uploadPage(page).metadataField;
  const byName: Record<string, Locator> = {
    description: fields.description,
    byline: fields.byline,
    credit: fields.credit,
    copyright: fields.copyright,
    specialInstructions: fields.specialInstructions,
  };
  for (const [field, value] of Object.entries(testContext.expectedMetadata!)) {
    await expect(byName[field], `field "${field}"`).toHaveValue(value);
  }
});

When('I fill in the description, byline and credit', async ({ page, testContext }) => {
  const editor = uploadPage(page);
  // Capture the debounced save before triggering it so the Then step can await it.
  testContext.mediaApiResponse = waitForMetadataSave(page);
  await editor.metadataField.description.fill('An e2e description');
  await editor.metadataField.byline.fill('An e2e byline');
  await editor.metadataField.credit.fill('An e2e credit');
  await editor.metadataField.credit.blur();
});

Then('the metadata should be saved automatically', async ({ testContext }) => {
  const response = await testContext.mediaApiResponse!;
  expect(response.ok()).toBeTruthy();
});

When('I leave the description or credit empty', async ({ page }) => {
  const editor = uploadPage(page);
  await editor.metadataField.description.fill('');
  await editor.metadataField.credit.fill('');
});

Then('those fields should be marked as mandatory', async ({ page }) => {
  const editor = uploadPage(page);
  await expect(editor.metadataField.description).toHaveJSProperty('required', true);
  await expect(editor.metadataField.credit).toHaveJSProperty('required', true);
});

Then('I should be able to choose an image type from a dropdown', async ({ page }) => {
  const imageType = uploadPage(page).metadataField.imageType;
  await expect(imageType).toBeVisible();
  for (const type of E2E_IMAGE_TYPES) {
    await expect(imageType.locator('option', { hasText: type })).toHaveCount(1);
  }
  await imageType.selectOption(E2E_IMAGE_TYPES[0]);
  // AngularJS ng-options encodes the value (e.g. "string:Photograph"), so assert the label.
  await expect(imageType.locator('option:checked')).toHaveText(E2E_IMAGE_TYPES[0]);
});

When('I type into the credit field', async ({ page }) => {
  // Type (not fill) so gr-datalist fires its metadata-search as the user types.
  await uploadPage(page).metadataField.credit.pressSequentially('Gett');
});

Then('I should see suggestions matching existing credits', async ({ page }) => {
  await expect(uploadPage(page).creditSuggestions.filter({ hasText: 'Getty Images' })).toBeVisible();
});

When('a metadata template is selected', async ({ page }) => {
  await uploadPage(page).metadataTemplateSelect.selectOption({
    label: E2E_METADATA_TEMPLATE.templateName,
  });
});

Then('the affected fields should be populated and made read-only', async ({ page }) => {
  const editor = uploadPage(page);
  const byline = E2E_METADATA_TEMPLATE.fields.find((f) => f.name === 'byline')!.value;
  const credit = E2E_METADATA_TEMPLATE.fields.find((f) => f.name === 'credit')!.value;
  await expect(editor.metadataField.byline).toHaveValue(byline);
  await expect(editor.metadataField.credit).toHaveValue(credit);
  await expect(editor.metadataField.byline).toHaveJSProperty('readOnly', true);
  await expect(editor.metadataField.credit).toHaveJSProperty('readOnly', true);
});

Given('a field is edited', async ({ page, testContext }) => {
  testContext.editedByline = 'Edited byline before template';
  await uploadPage(page).metadataField.byline.fill(testContext.editedByline);
  await uploadPage(page).metadataField.byline.blur();
});

When('a metadata template is selected and then removed', async ({ page }) => {
  const select = uploadPage(page).metadataTemplateSelect;
  await select.selectOption({ label: E2E_METADATA_TEMPLATE.templateName });
  await expect(uploadPage(page).metadataField.byline).toHaveJSProperty('readOnly', true);
  await select.selectOption('');
});

Then('the previously overridden fields are restored', async ({ page, testContext }) => {
  const byline = uploadPage(page).metadataField.byline;
  await expect(byline).toHaveJSProperty('readOnly', false);
  await expect(byline).toHaveValue(testContext.editedByline!);
});

Then('I should see the existing usage instructions', async ({ page }) => {
  await expect(
    uploadPage(page).metadataEditor.getByText(E2E_USAGE_INSTRUCTIONS.text),
  ).toBeVisible();
});

Then('I should be able to add further special instructions', async ({ page }) => {
  await expect(uploadPage(page).metadataField.specialInstructions).toBeVisible();
});

Given(
  'I am not permitted to edit the image, as it has been uploaded by another user and I do not have edit_metadata permission',
  async ({ page, testContext }) => {
    const image = uniqueImage();
    testContext.uploadedImagePath = image.path;
    await uploadPage(page).fileInput.setInputFiles(image.path);
    await expect(uploadPage(page).metadataEditor).toBeVisible();

    // Clearing cookies drops both the Panda and OIDC sessions, so we sign in afresh.
    await page.context().clearCookies();
    await openUploadPage(page, TEST_ACCOUNTS.restricted);

    // The fields start disabled until canUserEdit resolves, so prove the API really denies edits.
    await expectNoEditPermission(page, image.path, TEST_ACCOUNTS.fullAccess);
  },
);

When('I view the metadata editor for an image I did not upload', async ({ page, testContext }) => {
  // Re-uploading the same bytes surfaces the existing image, which keeps its original uploader.
  await uploadPage(page).fileInput.setInputFiles(testContext.uploadedImagePath!);
  await expect(uploadPage(page).metadataEditor).toBeVisible();
});

Then('the metadata fields should be disabled', async ({ page }) => {
  const { description, byline, credit, imageType, specialInstructions } =
    uploadPage(page).metadataField;
  const fields = { description, byline, credit, imageType, specialInstructions };
  for (const [name, field] of Object.entries(fields)) {
    await expect(field, `field "${name}"`).toBeDisabled();
  }
});

Given('I am uploading more than one image', async ({ page }) => {
  await uploadPage(page).fileInput.setInputFiles([uniqueImage().path, uniqueImage().path]);
  await expect(uploadPage(page).metadataEditor).toHaveCount(2);
});

// Precondition satisfied by the default e2e permissions (edit is granted).
Given('I am permitted to edit', async () => {});

When(
  'I apply the following field values to all current uploads:',
  async ({ page, testContext }, table: DataTable) => {
    const editors = uploadPage(page).metadataEditor;
    const firstEditor = editors.first();
    // Let the filename-derived description land first, or its reindex resets our edits.
    for (let i = 0; i < (await editors.count()); i++) {
      await expect(editors.nth(i).locator('textarea[name="description"]')).not.toHaveValue('');
    }
    testContext.batchApplied = {};
    const jobs = uploadPage(page).imageEditorJob;
    for (const [label] of table.raw()) {
      const editorField = IMAGE_EDITOR_FIELDS[label];
      if (editorField) {
        await editorField.set(jobs.first(), editorField.value);
        await editorField.expectOn(jobs.first(), editorField.value);
        await editorField.applyButton(jobs.first()).click();
        testContext.batchApplied[label] = editorField.value;
        await expectOnEveryJob(jobs, editorField, editorField.value);
        continue;
      }
      const field = BATCH_FIELDS[label];
      const input = field.input(firstEditor);
      if (field.isSelect) {
        // selectOption doesn't focus the input, so we must do this manually
        await input.focus();
        await input.selectOption({ label: field.value });
      } else {
        await input.fill(field.value);
      }
      await input.blur();
      // imageType/description's ⇔ only returns once the saved edit is reindexed.
      const apply = firstEditor.getByTitle(field.applyTitle);
      await expect(apply).toBeVisible({ timeout: 15_000 });
      await apply.click();
      testContext.batchApplied[label] = field.value;
      await expectFieldOnEveryEditor(editors, field, field.value);
    }
  },
);

Then(
  'that value should be applied to the same field on every current upload',
  async ({ page, testContext }) => {
    const editors = uploadPage(page).metadataEditor;
    for (const [label, value] of Object.entries(testContext.batchApplied!)) {
      const editorField = IMAGE_EDITOR_FIELDS[label];
      await (editorField
        ? expectOnEveryJob(uploadPage(page).imageEditorJob, editorField, value)
        : expectFieldOnEveryEditor(editors, BATCH_FIELDS[label], value));
    }
  },
);

async function expectOnEveryJob(
  jobs: Locator,
  field: (typeof IMAGE_EDITOR_FIELDS)[string],
  value: string,
): Promise<void> {
  const count = await jobs.count();
  for (let i = 0; i < count; i++) {
    await field.expectOn(jobs.nth(i), value);
  }
}

async function expectFieldOnEveryEditor(
  editors: Locator,
  field: (typeof BATCH_FIELDS)[string],
  value: string,
): Promise<void> {
  const count = await editors.count();
  for (let i = 0; i < count; i++) {
    const input = field.input(editors.nth(i));
    // AngularJS ng-options encodes <select> values (e.g. "string:Photograph"), so check the label.
    await (field.isSelect
      ? expect(input.locator('option:checked')).toHaveText(value)
      : expect(input).toHaveValue(value));
  }
}
