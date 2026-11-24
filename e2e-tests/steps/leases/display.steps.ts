/** Steps for how the single image view shows an image's leases. */
import type { Page } from '@playwright/test';
import { API_KEY_NAME } from '../../setup/constants.ts';
import type { SeedLease } from '../../setup/seed-leases.ts';
import { Given, Then, When, expect } from '../setup.ts';
import type { SeedImage, TestContext } from '../setup.ts';
import { MONTHS, deleteLeaseControl, leaseItem, leaseItems, leasesRegion, seedLeasedImage } from './leases.ts';

const daysFromNow = (days: number): string => new Date(Date.now() + days * 86_400_000).toISOString();

async function seedLease(
  { seedImage, testContext }: { seedImage: SeedImage; testContext: TestContext },
  lease: Omit<SeedLease, 'access'>,
): Promise<void> {
  testContext.imageId = await seedLeasedImage(seedImage, [{ access: 'allow-use', ...lease }]);
}

/** The scenario's only lease, in the single image view. */
const theLease = (page: Page) => leaseItems(leasesRegion(page));

Given(
  'the image has a lease that started {int} days ago, expires in {int} days and has the notes {string}',
  async ({ seedImage, testContext }, startedDaysAgo: number, expiresInDays: number, notes: string) => {
    await seedLease({ seedImage, testContext }, {
      startDate: daysFromNow(-startedDaysAgo),
      endDate: daysFromNow(expiresInDays),
      notes,
    });
  },
);

Given('the image has a lease that starts in {int} days', async ({ seedImage, testContext }, days: number) => {
  await seedLease({ seedImage, testContext }, { startDate: daysFromNow(days) });
});

Given('the image has an inactive lease that expired {int} days ago', async ({ seedImage, testContext }, days: number) => {
  await seedLease({ seedImage, testContext }, { endDate: daysFromNow(-days) });
});

Given('the image has a lease with no end date', async ({ seedImage, testContext }) => {
  await seedLease({ seedImage, testContext }, {});
});

Given(
  'the image has a lease created by {string} on {int} {word} {int} at {int}:{int}',
  async ({ seedImage, testContext }, leasedBy: string, day: number, month: string, year: number, hours: number, minutes: number) => {
    // The leases service records whoever adds a lease, which for seeding is the API key.
    expect(leasedBy, 'seeded leases are leased by the API key').toBe(API_KEY_NAME);
    const monthIndex = MONTHS.indexOf(month);
    expect(monthIndex, `"${month}" is not a short month name`).toBeGreaterThanOrEqual(0);
    // Local time, as Kahuna formats it in the browser, which shares this machine's time zone.
    const createdAt = new Date(year, monthIndex, day, hours, minutes).toISOString();
    await seedLease({ seedImage, testContext }, { createdAt });
  },
);

Then(
  'I see the {string} lease in the {string} region',
  async ({ page }, label: string, region: string) => {
    const scope = page.getByRole('region', { name: region, exact: true });
    await expect(leaseItem(scope, label)).toBeVisible();
  },
);

Then('I do not see a delete control on the lease', async ({ page }) => {
  await expect(theLease(page)).toBeVisible();
  await expect(deleteLeaseControl(leasesRegion(page))).toHaveCount(0);
});

Then('the lease is labelled {string}', async ({ page }, label: string) => {
  await expect(theLease(page).getByText(label, { exact: true })).toBeVisible();
});

Then('the lease shows {string}', async ({ page }, text: string) => {
  await expect(theLease(page).getByText(text, { exact: true })).toBeVisible();
});

Then('the lease is shown as inactive', async ({ page }) => {
  // leaseClass() marks the lease's wrapper inactive, which leases.css fades.
  await expect(theLease(page).locator('.lease__wrapper')).toContainClass('lease__inactive');
});

When('I hover over the lease', async ({ page }) => {
  await theLease(page).hover();
});

Then('I see a tooltip with {string}', async ({ page }, text: string) => {
  await expect(theLease(page).getByText(text)).toBeVisible();
});
