import { Given, KAHUNA_APP_URL, Then, When, expect } from './fixtures.ts';
import { testImages, uploadPage } from './support/upload-page.ts';

const FILES_TO_UPLOAD = [testImages.smaller, testImages.larger];

/** Long enough for a scenario's assertions, short enough not to drag out teardown. */
const UPLOAD_HOLD_MS = 5_000;

// ---------------------------------------------------------------------------
// Upload page shell
// ---------------------------------------------------------------------------

Given('I am permitted to upload images', async ({ page }) => {
  // Kahuna decides whether to show the upload tools by looking for a `loader` link on the
  // media API root, which the API only emits for users holding the upload permission.
  const mediaApiUri = await page.evaluate(
    () => document.querySelector('link[rel="media-api-uri"]')?.getAttribute('href'),
  );
  const response = await page.request.get(mediaApiUri!);
  const { links } = (await response.json()) as { links: { rel: string }[] };

  expect(links.map((link) => link.rel)).toContain('loader');
});

When('the upload page loads', async ({ page }) => {
  await expect(uploadPage(page).main).toBeVisible();
});

Then('I should see the file upload prompt', async ({ page }) => {
  await expect(uploadPage(page).prompt).toBeVisible();
});

Then('I should see my past {int} uploads', async ({ page }, count: number) => {
  await expect(page.getByRole('region', { name: `Your past ${count} uploads` })).toBeVisible();
});

Then('the drag-and-drop uploader should be active', async ({ page }) => {
  // The dropzone overlay only renders mid-drag, so "active" means mounted and listening.
  await expect(uploadPage(page).dragAndDropUploader).toBeAttached();
});

When('I choose {string} from the top bar', async ({ page }, label: string) => {
  await uploadPage(page).topBarLink(label).click();
});

Then('I should be taken to the image search page', async ({ page }) => {
  await expect(page).toHaveURL((url) => url.origin === KAHUNA_APP_URL && url.pathname === '/search');
});

Given('I have an upload in progress', async ({ page }) => {
  // Hold the transfer to the ingest bucket open, otherwise the job reaches a terminal
  // state within a second or so and is no longer "in progress" by the time we assert.
  await page.route(
    (url) => url.hostname.startsWith('localstack.'),
    async (route) => {
      if (route.request().method() !== 'PUT') return route.fallback();
      await new Promise((resolve) => setTimeout(resolve, UPLOAD_HOLD_MS));
      await route.abort();
    },
  );

  await uploadPage(page).fileInput.setInputFiles(testImages.smaller.path);
  await expect(uploadPage(page).job(testImages.smaller.fileName)).toBeVisible();
});

Then('I should see my current uploads section', async ({ page }) => {
  await expect(uploadPage(page).currentUploads).toBeVisible();
});

When('I choose {string}', async ({ page }, label: string) => {
  await uploadPage(page).pastUploads.getByRole('link', { name: label }).click();
});

Then('I should be taken to a search filtered to images I uploaded', async ({ page }) => {
  await expect(page).toHaveURL((url) => Boolean(url.searchParams.get('uploadedBy')));
});

When('I try to navigate away from the upload page', async ({ page }) => {
  // Going back is what a user does, and it is also the only navigation the controller's
  // guard sees: on a ui-sref click ui-router destroys its scope before broadcasting
  // $locationChangeStart, so the listener registered there never runs.
  await page.goBack();
});

Then('I should be warned that uploads are in progress and asked to confirm', async ({ testContext }) => {
  await expect
    .poll(() => testContext.dialogs)
    .toContain('You have uploads in progress. Are you sure you want to leave this page?');
});

// ---------------------------------------------------------------------------
// File upload prompt
// ---------------------------------------------------------------------------

Then('I should see a message telling me to drag and drop or click to upload to the system', async ({ page }) => {
  const systemName = await page.evaluate(() => window._clientConfig.systemName);

  await expect(uploadPage(page).prompt).toContainText(
    `Either drag 'n drop images onto this screen or click`,
  );
  await expect(uploadPage(page).prompt).toContainText(`to get your images on ${systemName}.`);
});

// ---------------------------------------------------------------------------
// Select-files uploader
// ---------------------------------------------------------------------------

When('I click the {string} button', async ({ page, testContext }, label: string) => {
  testContext.fileChooser = page.waitForEvent('filechooser');
  await uploadPage(page).uploadButton(label).click();
});

Then('the system file picker should open', async ({ testContext }) => {
  const fileChooser = await testContext.fileChooser;

  expect(fileChooser?.isMultiple()).toBe(true);
});

When('I select one or more image files to upload', async ({ page }) => {
  await uploadPage(page).fileInput.setInputFiles(FILES_TO_UPLOAD.map(({ path }) => path));
});

Then('those files should be queued for upload', async ({ page }) => {
  for (const { fileName } of FILES_TO_UPLOAD) {
    await expect(uploadPage(page).job(fileName)).toBeVisible();
  }
});

Then('I should be taken to the upload progress view', async ({ page }) => {
  await expect(uploadPage(page).currentUploads).toBeVisible();
});

Given('an upload size limit is configured', async ({ page }) => {
  // upload/manager.js reads the limit when files are selected, so setting it now is enough.
  const limit = Math.round((testImages.smaller.bytes + testImages.larger.bytes) / 2);

  await page.evaluate((bytes) => {
    window._clientConfig.maybeUploadLimitInBytes = bytes;
  }, limit);
});

When('I select a file that is larger than the size limit', async ({ page }) => {
  await uploadPage(page).fileInput.setInputFiles(FILES_TO_UPLOAD.map(({ path }) => path));
});

Then('I should be warned that the oversized file will be skipped', async ({ testContext }) => {
  await expect.poll(() => testContext.dialogs.join('\n')).toContain('are above the size limit');
  expect(testContext.dialogs.join('\n')).toContain(testImages.larger.fileName);
});

Then('only the files within the limit should be queued for upload', async ({ page }) => {
  await expect(uploadPage(page).job(testImages.smaller.fileName)).toBeVisible();
  await expect(uploadPage(page).job(testImages.larger.fileName)).toBeHidden();
});
