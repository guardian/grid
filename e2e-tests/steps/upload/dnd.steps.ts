import { Given, Then, When, expect } from '../setup.ts';
import { GRID_IMAGE_MIME_TYPE, dragAway, dragOver, drop } from '../utils/drag-and-drop.ts';
import { filesToUpload, gridHostedImageUrl, uploadPage } from './setup.ts';

/** From kahuna/public/js/strings.json. */
const DROPZONE_EXPLANATION =
  'Drop files here to upload them instantly to the Grid';

When('I drag files over the upload page', async ({ page }) => {
  await dragOver(page, { files: filesToUpload });
});

Then('the dropzone overlay should appear with an explanation', async ({ page }) => {
  await expect(uploadPage(page).dropzone).toBeVisible();
  await expect(uploadPage(page).dropzone).toContainText(DROPZONE_EXPLANATION);
});

Given('the dropzone overlay is showing', async ({ page }) => {
  await dragOver(page, { files: filesToUpload });
  await expect(uploadPage(page).dropzone).toBeVisible();
});

When('I drag away from the upload page', async ({ page }) => {
  await dragAway(page);
});

Then('the dropzone overlay should disappear', async ({ page }) => {
  await expect(uploadPage(page).dropzone).not.toBeVisible();
});

When('I drop one or more image files onto the page', async ({ page }) => {
  await drop(page, { files: filesToUpload });
});

When('I drop an image URL onto the page', async ({ page }) => {
  await drop(page, { uri: gridHostedImageUrl });
});

Then('the image at that URL should not be queued for upload', async ({ page }) => {
  await expect(uploadPage(page).job(gridHostedImageUrl)).not.toBeVisible();
});

When('I drag an image that is already in the Grid over the page', async ({ page }) => {
  await dragOver(page, {
    uri: 'https://media.local.dev-gutools.co.uk/images/example',
    types: [GRID_IMAGE_MIME_TYPE],
  });
});

Then('the dropzone overlay should not appear', async ({ page }) => {
  await expect(uploadPage(page).dropzone).not.toBeVisible();
});
