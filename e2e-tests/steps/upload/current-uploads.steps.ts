import { Given, Then, When, expect } from '../setup.ts';
import {
  failIngest,
  filesToUpload,
  holdIngest,
  testImages,
  uniqueImage,
  uploadPage,
} from './setup.ts';

const { fileName: uploadingFile } = testImages.smaller;

Given('I have several uploads in progress', async ({ page }) => {
  await holdIngest(page);
  await uploadPage(page).fileInput.setInputFiles(filesToUpload.map(({ path }) => path));
  for (const { fileName } of filesToUpload) {
    await expect(uploadPage(page).job(fileName)).toBeVisible();
  }
});

Given('a file is uploading', async ({ page }) => {
  await holdIngest(page);
  await uploadPage(page).fileInput.setInputFiles(testImages.smaller.path);
  await expect(uploadPage(page).job(uploadingFile)).toBeVisible();
});

Given('an upload has failed', async ({ page }) => {
  await failIngest(page);
  await uploadPage(page).fileInput.setInputFiles(testImages.smaller.path);
});

Given('an upload has completed', async ({ page }) => {
  await uploadPage(page).fileInput.setInputFiles(testImages.smaller.path);
});

Given('an uploaded image is shown in my current uploads', async ({ page }) => {
  // A unique image so deleting it can't affect other scenarios or re-runs.
  await uploadPage(page).fileInput.setInputFiles(uniqueImage().path);
  await expect(uploadPage(page).deleteJobButton).toBeVisible();
});

When('I view my current uploads', async ({ page }) => {
  await expect(uploadPage(page).currentUploads).toBeVisible();
});

Then('I should see a count of how many uploads remain', async ({ page }) => {
  await expect(uploadPage(page).currentUploads).toContainText(`${filesToUpload.length} remaining`);
});

Then('I should see a preview thumbnail with the file name and size', async ({ page }) => {
  const job = uploadPage(page).job(uploadingFile);
  await expect(job.locator('img.preview__image')).toBeVisible();
  await expect(job).toContainText(uploadingFile);
  await expect(job).toContainText(/\d+(\.\d+)?\s*(Bytes|KB|MB)/);
});

Then("I should see the job's status", async ({ page }) => {
  await expect(uploadPage(page).job(uploadingFile).locator('.job-status')).toBeVisible();
});

Then('the job should be marked as an upload error with the error message', async ({ page }) => {
  await expect(uploadPage(page).job(uploadingFile).locator('.job-status')).toContainText(
    'upload error',
  );
});

Then('I should be able to remove the failed job after confirming', async ({ page }) => {
  const job = uploadPage(page).job(uploadingFile);
  const remove = job.getByRole('button', { name: 'Delete image' });
  await remove.click(); // arms the confirm
  await remove.click(); // confirms
  await expect(job).toBeHidden();
});

Then('the job should switch to the image metadata editor', async ({ page }) => {
  await expect(uploadPage(page).editableJob).toBeVisible();
});

When('the image is deleted using the delete button at the bottom of the job form', async ({ page }) => {
  const remove = uploadPage(page).deleteJobButton;
  await remove.click();
  await remove.click();
});

Then('it should be removed from my current uploads', async ({ page }) => {
  await expect(uploadPage(page).currentJobs).toHaveCount(0);
});
