/** Steps for the single image view that more than one feature uses. */
import { Then, expect } from './setup.ts';

Then('I see a(n) {string} region', async ({ page, testContext }, name: string) => {
  testContext.region = page.getByRole('region', { name, exact: true });
  await expect(testContext.region).toBeVisible();
});

Then('I do not see a(n) {string} region', async ({ page }, name: string) => {
  // Once a sibling region has rendered, a missing region is not one still loading.
  await expect(page.getByRole('region', { name: 'Rights and restrictions', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name, exact: true })).toBeHidden();
});
