/** Lease steps shared across the lease features' scenario groups. */
import type { Page } from '@playwright/test';
import { Given, Then, When, expect } from '../setup.ts';
import type { TestContext } from '../setup.ts';
import { answerDialogs } from '../utils/dialogs.ts';
import { openImage } from '../utils/single-image.ts';
import { leaseAccess, recordLeaseWrites, seedLeasedImage } from './leases.ts';

Given('the image has no leases', async ({ seedImage, testContext }) => {
  testContext.imageId = await seedLeasedImage(seedImage);
});

// With no start or end date, the lease is active.
Given(
  'the image has a(n) (active ){string} lease',
  async ({ seedImage, testContext }, access: string) => {
    testContext.imageId = await seedLeasedImage(seedImage, [{ access: leaseAccess(access) }]);
  },
);

/** Open the single image view of the image an earlier step seeded. */
async function openSeededImage({ page, testContext }: { page: Page; testContext: TestContext }) {
  expect(testContext.imageId, 'no image was seeded by an earlier step').toBeDefined();
  answerDialogs(page, testContext);
  recordLeaseWrites(page, testContext);
  await openImage(page, testContext.imageId!);
}

When('I open the single image view of the image', openSeededImage);
Given('I have opened the single image view of the image', openSeededImage);

Given(
  'I have opened the single image view of an image with no leases',
  async ({ page, seedImage, testContext }) => {
    testContext.imageId = await seedLeasedImage(seedImage);
    await openSeededImage({ page, testContext });
  },
);

Then('I am alerted {string}', async ({ testContext }, message: string) => {
  await expect.poll(() => testContext.dialogs).toContain(message);
});

Then('I am asked {string}', async ({ testContext }, message: string) => {
  await expect.poll(() => testContext.dialogs).toContain(message);
});

Then('I see a(n) {string} button', async ({ page }, name: string) => {
  await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
});

Then('I do not see a(n) {string} button', async ({ page }, name: string) => {
  await expect(page.getByRole('button', { name, exact: true })).toBeHidden();
});

Then('I do not see a(n) {string} region', async ({ page }, name: string) => {
  // Once a sibling region has rendered, a missing region is not one still loading.
  await expect(page.getByRole('region', { name: 'Rights and restrictions', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name, exact: true })).toBeHidden();
});
