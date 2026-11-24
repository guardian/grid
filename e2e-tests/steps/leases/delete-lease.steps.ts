/** Steps for deleting a lease in the single image view. */
import type { Page } from '@playwright/test';
import { imageLeases } from '../../setup/seed-leases.ts';
import { Given, Then, When, expect } from '../setup.ts';
import { pauseClock } from '../utils/clock.ts';
import { deleteLeaseControl, failLeaseRequests, leaseItems, leasesRegion } from './leases.ts';

/** gr-confirm-delete reverts to "Delete" this long after the first click. */
const CONFIRM_WINDOW_MS = 5_000;

// gr-confirm-delete prefixes its label with an icon ligature ("delete"), so match the label alone.
const deleteControlLabel = (page: Page, label: string) =>
  deleteLeaseControl(leasesRegion(page)).getByText(label, { exact: true });

When('I click delete on the lease', async ({ page }) => {
  await deleteLeaseControl(leasesRegion(page)).click();
});

When('I delete the lease and confirm', async ({ page }) => {
  const control = deleteLeaseControl(leasesRegion(page));
  await control.click();
  await expect(control.getByText('Confirm delete', { exact: true })).toBeVisible();
  await control.click();
});

When('I click delete on the lease and wait five seconds', async ({ page }) => {
  await pauseClock(page);
  await deleteLeaseControl(leasesRegion(page)).click();
  const confirm = deleteControlLabel(page, 'Confirm delete');
  await expect(confirm).toBeVisible();
  await page.clock.runFor(CONFIRM_WINDOW_MS - 1);
  await expect(confirm, 'the confirmation just before it lapses').toBeVisible();
  await page.clock.runFor(1);
});

Then('the delete control shows {string}( again)', async ({ page }, label: string) => {
  await expect(deleteControlLabel(page, label)).toBeVisible();
});

Then('the lease is still on the image', async ({ page, testContext }) => {
  expect(testContext.leaseWrites, 'requests to change leases').toEqual([]);
  await expect(leaseItems(leasesRegion(page))).toHaveCount(1);
  expect(await imageLeases(testContext.imageId!), 'the leases media-api serves').toHaveLength(1);
});

Given('deleting leases will fail', async ({ page }) => {
  await failLeaseRequests(page, 'DELETE');
});
