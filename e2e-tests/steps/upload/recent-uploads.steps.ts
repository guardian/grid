import * as path from 'node:path';
import { Given, Then, When, expect } from '../setup.ts';
import { TEST_ACCOUNTS } from '../../setup/constants.ts';
import { openUploadPage } from '../common.steps.ts';
import { expectInUploadHistory, holdPastUploads } from './media-api.assertions.ts';
import { uniqueImage, uploadPage } from './setup.ts';

const LOADING_MESSAGE = 'Loading…';

When('my past uploads have not yet loaded', async ({ page, testContext }) => {
  testContext.releasePastUploads = await holdPastUploads(page);
  await page.reload();
});

Then('I should see a loading message', async ({ page, testContext }) => {
  const loading = uploadPage(page).pastUploads.getByText(LOADING_MESSAGE);
  await expect(loading).toBeVisible();
  testContext.releasePastUploads!();
  await expect(loading).toBeHidden();
});

Given('I have never uploaded an image', async ({ page }) => {
  // The full-access account's history grows as the suite runs; the restricted one never uploads.
  await page.context().clearCookies();
  await openUploadPage(page, TEST_ACCOUNTS.restricted);
});

Given('I have uploaded images before', async ({ page, testContext }) => {
  const image = uniqueImage();
  testContext.uploadedImagePath = image.path;
  await uploadPage(page).fileInput.setInputFiles(image.path);
  await expect(uploadPage(page).editableJob).toBeVisible();

  await expectInUploadHistory(page, image.path, TEST_ACCOUNTS.fullAccess);
  // Past uploads are only fetched when the page loads.
  await page.reload();
});

When('my past uploads load', async ({ page }) => {
  const { pastUploads } = uploadPage(page);
  await expect(pastUploads).toBeVisible();
  await expect(pastUploads.getByText(LOADING_MESSAGE)).toBeHidden();
});

Then("I should see a message that I haven't uploaded anything yet", async ({ page }) => {
  await expect(
    uploadPage(page).pastUploads.getByText('You haven’t uploaded anything yet.'),
  ).toBeVisible();
});

Then('I should see each of my past uploaded images', async ({ page, testContext }) => {
  const fileName = path.basename(testContext.uploadedImagePath!);
  await expect(uploadPage(page).pastUpload(fileName)).toBeVisible();
});

Then('I should be able to delete an image I am permitted to delete', async ({ page, testContext }) => {
  const pastUpload = uploadPage(page).pastUpload(path.basename(testContext.uploadedImagePath!));
  const remove = pastUpload.getByRole('button', { name: 'Delete image' });
  await remove.click(); // arms the confirm
  await remove.click(); // confirms
  await expect(pastUpload).toBeHidden();
});
