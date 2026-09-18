import { Given, Then, When, expect } from '../setup.ts';
import { E2E_IMAGE_TYPES, E2E_METADATA_TEMPLATE } from '../../setup/config.ts';
import { uniqueImage, uploadPage } from './setup.ts';

/** Upload a unique image and wait for it to become the required-metadata editor. */
async function uploadAndOpenEditor(page: import('@playwright/test').Page): Promise<void> {
  await uploadPage(page).fileInput.setInputFiles(uniqueImage().path);
  await expect(uploadPage(page).metadataEditor).toBeVisible();
}

Given('an uploaded image is shown in the metadata editor', async ({ page }) => {
  await uploadAndOpenEditor(page);
});

Given('an uploaded image with no description', async ({ page }) => {
  await uploadAndOpenEditor(page);
});

// Precondition satisfied by the e2e stack config (see E2E_IMAGE_TYPES in setup/config.ts).
Given('image types are configured', async () => {});

When('I view the description field', async ({ page }) => {
  await expect(uploadPage(page).metadataField.description).toBeVisible();
});

When('I view the metadata editor', async ({ page }) => {
  await uploadAndOpenEditor(page);
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

When('I fill in the description, byline and credit', async ({ page, testContext }) => {
  const editor = uploadPage(page);
  // Capture the debounced save before triggering it so the Then step can await it.
  testContext.mediaApiResponse = page.waitForResponse(
    (r) => r.request().method() === 'PUT' && new URL(r.url()).pathname.includes('/metadata'),
  );
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

Then('those fields should be marked as required', async ({ page }) => {
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
