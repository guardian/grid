/** Steps for the single image view that more than one feature uses. */
import { Given, Then, expect } from './setup.ts';
import { PLAIN_IMAGE, openSeededImage } from './utils/single-image.ts';

// A disposable copy, so scenarios that save rights, leases or templates don't change a shared
// fixture. A fresh copy has no leases.
Given(
  'I have opened the single image view of an image( with no leases)',
  async ({ page, seedImage, testContext }) => {
    testContext.imageId = await seedImage(PLAIN_IMAGE._source);
    await openSeededImage(page, testContext);
  },
);

Given('I( have) open(ed) the single image view of the image', async ({ page, testContext }) => {
  await openSeededImage(page, testContext);
});

Then('I see a(n) {string} region', async ({ page, testContext }, name: string) => {
  testContext.region = page.getByRole('region', { name, exact: true });
  await expect(testContext.region).toBeVisible();
});

Then('I do not see a(n) {string} region', async ({ page }, name: string) => {
  // Once a sibling region has rendered, a missing region is not one still loading.
  await expect(page.getByRole('region', { name: 'Rights and restrictions', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name, exact: true })).toBeHidden();
});
