import type { DataTable } from 'playwright-bdd';
import { Given, KAHUNA_APP_URL, Then, When, expect } from '../setup.ts';
import { filesToUpload, holdIngest, testImages, uploadPage } from './setup.ts';

/**
 * Upload page shell
 */

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

Then('I should not see the current uploads section', async ({ page }) => {
  await expect(uploadPage(page).currentUploads).not.toBeVisible();
});

Given(
  'I had searched for {string} before opening the upload page',
  async ({ page, testContext }, query: string) => {
    await page.goto(`${KAHUNA_APP_URL}/search?query=${encodeURIComponent(query)}`);
    await expect(page.getByRole('main', { name: 'Image search results' })).toBeVisible();
    testContext.previousSearchQuery = query;

    await page.getByRole('banner').getByRole('link', { name: 'My recent uploads' }).click();
    await page.waitForURL('**/upload');
  },
);

When('I choose {string} from the top bar', async ({ page }, label: string) => {
  await uploadPage(page).topBarLink(label).click();
});

Then('I should be taken to the image search page', async ({ page }) => {
  await expect(page).toHaveURL((url) => url.origin === KAHUNA_APP_URL && url.pathname === '/search');
});

Then('my previous search should be intact', async ({ page, testContext }) => {
  // The `search` state is a deep-state redirect, so entering it without params sends us
  // back to the `search.results` params we left behind.
  await expect(page).toHaveURL(
    (url) => url.searchParams.get('query') === testContext.previousSearchQuery,
  );
});

Given('I have an upload in progress', async ({ page }) => {
  // Hold the transfer open, otherwise the job reaches a terminal state within a second or so
  // and is no longer "in progress" by the time we assert.
  await holdIngest(page);

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
  await expect(page).toHaveURL((url) => url.searchParams.get('uploadedBy') === 'johndoe@example.com');
});

When(
  'I try to navigate away from the upload page via the following buttons:',
  async ({ page }, buttons: DataTable) => {
    for (const [label] of buttons.raw()) {
      await uploadPage(page).leaveLink(label).click();
      // Dismissing the confirm answers "no", so each button leaves us here for the next one.
      await expect(page).toHaveURL(/\/upload/);
    }
  },
);

Then('I should be warned that uploads are in progress and asked to confirm', async ({ testContext }) => {
  await expect
    .poll(() => testContext.dialogs)
    .toContain('You have uploads in progress. Are you sure you want to leave this page?');
});

/**
 * File upload prompt
 */

Then('I should see a message telling me to drag and drop or click to upload to the system', async ({ page }) => {
  const systemName = await page.evaluate(() => window._clientConfig.systemName);

  await expect(uploadPage(page).prompt).toContainText(
    `Either drag 'n drop images onto this screen or click`,
  );
  await expect(uploadPage(page).prompt).toContainText(`to get your images on ${systemName}.`);
});

Given('I have not applied any preset labels', async ({ page }) => {
  await page.evaluate(() => window.localStorage.removeItem('preset-labels'));
  await page.reload();
});

Then('I should see a suggested example label to apply to all uploads', async ({ page }) => {
  // The example label offered by the prompt comes from kahuna/public/js/strings.json.
  await expect(uploadPage(page).prompt).toContainText(`label e.g. culture`);
});

/**
 * Select-files uploader
 */

When('I click the {string} button', async ({ page, testContext }, label: string) => {
  testContext.fileChooser = page.waitForEvent('filechooser');
  await uploadPage(page).uploadButton(label).click();
});

Then('the system file picker should open', async ({ testContext }) => {
  const fileChooser = await testContext.fileChooser;

  expect(fileChooser?.isMultiple()).toBe(true);
});

When('I select one or more image files to upload', async ({ page }) => {
  await uploadPage(page).fileInput.setInputFiles(filesToUpload.map(({ path }) => path));
});

Then('those files should be queued for upload', async ({ page }) => {
  for (const { fileName } of filesToUpload) {
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
  await uploadPage(page).fileInput.setInputFiles(filesToUpload.map(({ path }) => path));
});

Then('I should be warned that the oversized file will be skipped', async ({ testContext }) => {
  await expect.poll(() => testContext.dialogs.join('\n')).toContain('are above the size limit');
  expect(testContext.dialogs.join('\n')).toContain(testImages.larger.fileName);
});

Then('only the files within the limit should be queued for upload', async ({ page }) => {
  await expect(uploadPage(page).job(testImages.smaller.fileName)).toBeVisible();
  await expect(uploadPage(page).job(testImages.larger.fileName)).toBeHidden();
});
