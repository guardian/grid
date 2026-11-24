/** Steps for the lease widget on the upload page, and copying or clearing leases across uploads. */
import type { Locator, Page } from '@playwright/test';
import { E2E_LEASE_TEMPLATES } from '../../setup/config.ts';
import { Given, Then, When, expect } from '../setup.ts';
import type { TestContext } from '../setup.ts';
import { uniqueImage, uploadAsAnotherUser, uploadImages, uploadPage } from '../upload/setup.ts';
import { pauseClock } from '../utils/clock.ts';
import { chooseMetadataTemplate } from '../utils/metadata-templates.ts';
import {
  accessOfLabel,
  addLease,
  addLeaseButton,
  applyLeasesToAllButton,
  LEASE_PREVIEW_CLASS,
  expectShownDuringSave,
  labelOfAccess,
  leaseItem,
  leaseItems,
  pollLeasesOf,
  removeAllLeasesButton,
} from './leases.ts';

/** The remove all leases prompt reverts this long after it is shown (LeasesCtrl.batchApplyLeases). */
const PROMPT_WINDOW_MS = 5_000;

const ORDINALS: Record<string, number> = { first: 0, second: 1, other: 1 };

const ordinal = (word: string): number => {
  const index = ORDINALS[word];
  if (index === undefined) throw new Error(`"${word}" is not an upload ordinal`);
  return index;
};

/** The nth current upload's image editor, in the order the page lists them. */
const nthUpload = (page: Page, index: number) => uploadPage(page).imageEditorJob.nth(index);

/** An upload's lease widget. It has no accessible name of its own, so find it by its element. */
const uploadLeases = (job: Locator) => job.locator('gr-leases');

const nthUploadLeases = (page: Page, word: string) => uploadLeases(nthUpload(page, ordinal(word)));

/** The "Remove ALL leases in job?" prompt, labelled "Remove all leases" for assistive tech. */
const removeAllPrompt = (scope: Locator) => removeAllLeasesButton(scope);

const uploadIds = (testContext: TestContext): string[] => {
  expect(testContext.surfaceImageIds, 'no images were uploaded by an earlier step').toBeDefined();
  return testContext.surfaceImageIds!;
};

Given('I( have) upload(ed) {int} image(s)', async ({ page, testContext }, count: number) => {
  testContext.surfaceImageIds = await uploadImages(page, Array.from({ length: count }, () => uniqueImage().path));
});

When('I upload an image that another user has already uploaded', async ({ page, testContext }) => {
  const { path } = uniqueImage();
  await uploadAsAnotherUser(page, path);
  testContext.surfaceImageIds = await uploadImages(page, [path]);
});

When('I add a(n) {string} lease to the upload', async ({ page, testContext }, access: string) => {
  await addLease(page, testContext, nthUploadLeases(page, 'first'), access);
});

Then('the upload shows a(n) {string} lease', async ({ page, testContext }, label: string) => {
  await expect(leaseItem(nthUploadLeases(page, 'first'), label)).toBeVisible();
  await pollLeasesOf(uploadIds(testContext)[0]).toContainEqual(
    expect.objectContaining({ access: accessOfLabel(label) }),
  );
});

Then("the upload's leases have a(n) {string} button", async ({ page }, name: string) => {
  await expect(nthUploadLeases(page, 'first').getByRole('button', { name, exact: true })).toBeVisible();
});

Given('the {word} upload has a(n) {string} lease', async ({ page, testContext }, word: string, access: string) => {
  const label = labelOfAccess(access);
  await addLease(page, testContext, nthUploadLeases(page, word), label);
  await expect(leaseItem(nthUploadLeases(page, word), label)).toBeVisible();
  await pollLeasesOf(uploadIds(testContext)[ordinal(word)]).toContainEqual(
    expect.objectContaining({ access: accessOfLabel(label) }),
  );
});

Given('the {word} upload has no leases', async ({ page }, word: string) => {
  const leases = nthUploadLeases(page, word);
  await expect(addLeaseButton(leases)).toBeVisible();
  await expect(leaseItems(leases)).toHaveCount(0);
});

When(
  "I apply the first upload's leases to all current uploads",
  async ({ page, testContext }) => {
    // The other upload's widget is what shows the leases being replaced.
    testContext.watchDuringWrites = nthUploadLeases(page, 'other');
    await applyLeasesToAllButton(nthUploadLeases(page, 'first')).click();
  },
);

Then(
  'the other upload shows {string} while its leases are replaced',
  async ({ page, testContext }, text: string) => {
    await expectShownDuringSave(page, testContext, text, nthUploadLeases(page, 'other'));
  },
);

Then('both uploads show a(n) {string} lease', async ({ page, testContext }, label: string) => {
  for (const [index, id] of uploadIds(testContext).entries()) {
    await expect(leaseItem(uploadLeases(nthUpload(page, index)), label)).toBeVisible();
    await pollLeasesOf(id).toContainEqual(expect.objectContaining({ access: accessOfLabel(label) }));
  }
});

Then(
  'I see a(n) {string} button in place of the apply-to-all button',
  async ({ page }, text: string) => {
    const leases = nthUploadLeases(page, 'first');
    await expect(removeAllPrompt(leases)).toContainText(text);
    await expect(applyLeasesToAllButton(leases)).toBeHidden();
  },
);

Given(
  'the {string} prompt is shown on the first upload',
  async ({ page }, text: string) => {
    const leases = nthUploadLeases(page, 'first');
    await expect(leaseItems(leases), 'the prompt is only offered with no leases').toHaveCount(0);
    await applyLeasesToAllButton(leases).click();
    await expect(removeAllPrompt(leases)).toContainText(text);
  },
);

When('I wait five seconds', async ({ page }) => {
  await pauseClock(page);
  await expect(removeAllPrompt(nthUploadLeases(page, 'first'))).toBeVisible();
  await page.clock.runFor(PROMPT_WINDOW_MS);
});

Then('the apply-to-all button is shown again', async ({ page }) => {
  const leases = nthUploadLeases(page, 'first');
  await expect(applyLeasesToAllButton(leases)).toBeVisible();
  await expect(removeAllPrompt(leases)).toBeHidden();
});

When('I confirm removing all leases', async ({ page }) => {
  await removeAllPrompt(nthUploadLeases(page, 'first')).click();
});

Then('neither upload has any leases', async ({ page, testContext }) => {
  for (const [index, id] of uploadIds(testContext).entries()) {
    await expect(leaseItems(uploadLeases(nthUpload(page, index)))).toHaveCount(0);
    await pollLeasesOf(id).toEqual([]);
  }
});

When('I select a metadata template with leases for the first upload', async ({ page }) => {
  const [template] = E2E_LEASE_TEMPLATES;
  const job = nthUpload(page, 0);
  await chooseMetadataTemplate(job, template.templateName);
  // The preview lists the template's lease, marked as a preview (leases.html).
  await expect(leaseItem(uploadLeases(job), labelOfAccess(template.leaseType))).toContainClass(
    LEASE_PREVIEW_CLASS,
  );
});

Then('the first upload does not show the apply-to-all button', async ({ page }) => {
  await expect(applyLeasesToAllButton(nthUploadLeases(page, 'first'))).toBeHidden();
  // Only the previewing upload hides it.
  await expect(applyLeasesToAllButton(nthUploadLeases(page, 'second'))).toBeVisible();
});
