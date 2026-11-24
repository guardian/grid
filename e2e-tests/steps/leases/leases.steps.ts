/** Lease steps shared across the lease features' scenario groups. */
import type { Page } from '@playwright/test';
import { After, Given, When, expect } from '../setup.ts';
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
  await recordLeaseWrites(page, testContext);
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

// A confirm left unanswered stalls the page, and with it the fixtures' teardown.
After(async ({ testContext }) => {
  await testContext.heldConfirm?.dismiss().catch(() => {});
});
