/** Lease steps shared across the lease features' scenario groups. */
import { After, Before, Given } from '../setup.ts';
import { leaseAccess, recordLeaseWrites, seedLeasedImage, trackImageReads } from './leases.ts';

// Before any step loads a page, so lease steps can check what was (not) saved on any surface,
// and wait for the lease widget's fetch before opening its form.
Before({ tags: '@leases' }, async ({ page, testContext }) => {
  trackImageReads(page);
  await recordLeaseWrites(page, testContext);
});

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

// A confirm left unanswered stalls the page, and with it the fixtures' teardown.
After(async ({ testContext }) => {
  await testContext.heldConfirm?.dismiss().catch(() => {});
});
