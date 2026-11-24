/** Lease steps shared across the lease features' scenario groups. */
import type { Page } from '@playwright/test';
import { API_KEY_NAME, TEST_ACCOUNTS } from '../../setup/constants.ts';
import type { SeedLease } from '../../setup/seed-leases.ts';
import { imageLeases } from '../../setup/seed-leases.ts';
import { After, Before, Given, Then, When, expect } from '../setup.ts';
import type { SeedImage, TestContext } from '../setup.ts';
import { answerHeldConfirm } from '../utils/dialogs.ts';
import { pauseClock } from '../utils/clock.ts';
import {
  MONTHS,
  accessOfLabel,
  accesses,
  accessSelect,
  addLease,
  chooseAccess,
  closeLeaseFormButton,
  datePickerButton,
  deleteLeaseControl,
  expectShownDuringSave,
  failLeaseRequests,
  leaseAccess,
  leaseItem,
  leaseItems,
  leasesRegion,
  notesField,
  openAddLeaseForm,
  pollImageLeases,
  recordLeaseWrites,
  saveLeaseButton,
  seedLeasedImage,
  unchangedImageLeases,
} from './leases.ts';

const pad = (n: number) => String(n).padStart(2, '0');

/** A date as gu-date shows it (DD MMM YYYY HH:mm), in this machine's (and the browser's) time zone. */
const guDateDisplay = (date: Date) =>
  `${pad(date.getDate())} ${MONTHS[date.getMonth()]} ${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;

const endOfDayAfterTomorrow = (from: Date) =>
  new Date(from.getFullYear(), from.getMonth(), from.getDate() + 2, 23, 59);

const daysFromNow = (days: number): string => new Date(Date.now() + days * 86_400_000).toISOString();

/** gr-confirm-delete reverts to "Delete" this long after the first click. */
const CONFIRM_WINDOW_MS = 5_000;

// gr-confirm-delete prefixes its label with an icon ligature ("delete"), so match the label alone.
const deleteControlLabel = (page: Page, label: string) =>
  deleteLeaseControl(leasesRegion(page)).getByText(label, { exact: true });

/** The scenario's only lease, in the single image view. */
const theLease = (page: Page) => leaseItems(leasesRegion(page));

async function seedLease(
  { seedImage, testContext }: { seedImage: SeedImage; testContext: TestContext },
  lease: Omit<SeedLease, 'access'>,
): Promise<void> {
  testContext.imageId = await seedLeasedImage(seedImage, [{ access: 'allow-use', ...lease }]);
}

// Before any step loads a page, so lease steps can check what was (not) saved on any surface.
Before({ tags: '@leases' }, async ({ page, testContext }) => {
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

// Media-api lets the uploader edit their own image, with or without edit metadata permission.
Given(
  'an image I have added has a(n) (active ){string} lease',
  async ({ seedImage, testContext }, access: string) => {
    testContext.imageId = await seedLeasedImage(seedImage, [{ access: leaseAccess(access) }], {
      uploadedBy: TEST_ACCOUNTS.restricted,
    });
  },
);

// Add lease steps
Given('I( have) open(ed) the add lease form', async ({ page }) => {
  await openAddLeaseForm(leasesRegion(page));
});

Then('the add lease form is shown with {string} selected', async ({ page }, option: string) => {
  const select = accessSelect(leasesRegion(page));
  await expect(select).toBeVisible();
  await expect(select.getByRole('option', { selected: true })).toHaveText(option);
});

Then(
  'the access options are grouped as Usage {string}, {string} and Syndication {string}, {string}',
  async ({ page }, allowUse: string, denyUse: string, allowSyndication: string, denySyndication: string) => {
    const select = accessSelect(leasesRegion(page));
    // Playwright's accessibility tree lists a <select>'s options without their <optgroup>s, so
    // getByRole can't find a group; find each by its label instead.
    const group = (label: string) => select.locator(`optgroup[label="${label}"]`).getByRole('option');
    await expect(group('Usage')).toHaveText([allowUse, denyUse]);
    await expect(group('Syndication')).toHaveText([
      allowSyndication,
      denySyndication,
    ]);
  },
);

Then('the form has {string} and {string} buttons', async ({ page }, first: string, second: string) => {
  // The buttons' labels are hidden in the compact form, leaving their titles.
  const region = leasesRegion(page);
  await expect(region.getByTitle(first, { exact: true })).toBeVisible();
  await expect(region.getByTitle(second, { exact: true })).toBeVisible();
});

When('I cancel the form', async ({ page }) => {
  await closeLeaseFormButton(leasesRegion(page)).click();
});

Then('the add lease form is hidden', async ({ page }) => {
  await expect(accessSelect(leasesRegion(page))).toBeHidden();
});

Then('no lease is added to the image', async ({ page, testContext }) => {
  expect(await unchangedImageLeases(testContext), 'the leases media-api serves').toEqual([]);
  await expect(leaseItems(leasesRegion(page))).toHaveCount(0);
});

When('I save the lease without choosing an access type', async ({ page }) => {
  await saveLeaseButton(leasesRegion(page)).click();
});

When('I choose {string} access', async ({ page, testContext }, access: string) => {
  await chooseAccess(testContext, leasesRegion(page), access);
});

When(
  'I choose {string} access and tick {string}',
  async ({ page, testContext }, access: string, checkbox: string) => {
    await chooseAccess(testContext, leasesRegion(page), access);
    await leasesRegion(page).getByRole('checkbox', { name: checkbox, exact: true }).check();
  },
);

Then('a start and end date range is shown', async ({ page }) => {
  const region = leasesRegion(page);
  await expect(datePickerButton(region, 'from')).toBeVisible();
  await expect(datePickerButton(region, 'to')).toBeVisible();
});

Then('the end date defaults to the end of the day after tomorrow', async ({ page, testContext }) => {
  // Kahuna computes the default when the access is chosen, so either side of midnight is right.
  const candidates = [testContext.accessChosenAt!, new Date()].map((date) =>
    guDateDisplay(endOfDayAfterTomorrow(date)),
  );
  await expect(datePickerButton(leasesRegion(page), 'to')).toContainText(
    new RegExp(candidates.join('|')),
  );
});

Then('a notes field is shown', async ({ page }) => {
  await expect(notesField(leasesRegion(page))).toBeVisible();
});

// The form binds the picker to the start or end date (see leases.html); nothing on the page
// says which, so this checks the picker the chosen access type offers.
Then('an {string} date picker is shown for the start/end date', async ({ page }, label: string) => {
  await expect(datePickerButton(leasesRegion(page), label)).toBeVisible();
});

Then('dates before tomorrow cannot be chosen', async ({ page }) => {
  const region = leasesRegion(page);
  await datePickerButton(region, 'after').click();
  // Pikaday, a third-party date picker, marks the days before its minimum date `is-disabled`
  // and only with that class: they have no disabled attribute or ARIA state for a role-based
  // locator to use. It opens on the minimum date's month, so the first choosable day it shows
  // is the earliest one.
  const firstChoosableDay = region
    .locator('.pika-table td:not(.is-disabled):not(.is-empty)')
    .first()
    .getByRole('button');
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  await expect(firstChoosableDay).toHaveAttribute('data-pika-year', String(tomorrow.getFullYear()));
  await expect(firstChoosableDay).toHaveAttribute('data-pika-month', String(tomorrow.getMonth()));
  await expect(firstChoosableDay).toHaveAttribute('data-pika-day', String(tomorrow.getDate()));
});

Then('{string} and {string} options are shown', async ({ page }, first: string, second: string) => {
  const region = leasesRegion(page);
  await expect(region.getByRole('checkbox', { name: first, exact: true })).toBeVisible();
  await expect(region.getByRole('checkbox', { name: second, exact: true })).toBeVisible();
});

Given('saving leases will fail', async ({ page }) => {
  await failLeaseRequests(page, 'POST');
});

When('I add a(n) {string} lease', async ({ page, testContext }, access: string) => {
  await addLease(page, testContext, leasesRegion(page), access);
});

When(
  'I add a(n) {string} lease with the notes {string}',
  async ({ page, testContext }, access: string, notes: string) => {
    await addLease(page, testContext, leasesRegion(page), access, { notes });
  },
);

When(
  'I add a(n) {string} lease with {string} and {string} ticked and the notes {string}',
  async ({ page, testContext }, access: string, first: string, second: string, notes: string) => {
    await addLease(page, testContext, leasesRegion(page), access, { ticked: [first, second], notes });
  },
);

When(
  'I add a(n) {string} lease and decline the overwrite confirmation',
  async ({ page, testContext }, access: string) => {
    await addLease(page, testContext, leasesRegion(page), access);
    await answerHeldConfirm(testContext, false);
  },
);

When('I accept the confirmation', async ({ testContext }) => {
  await answerHeldConfirm(testContext, true);
});

// Delete lease steps
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
  expect(await unchangedImageLeases(testContext), 'the leases media-api serves').toHaveLength(1);
  await expect(leaseItems(leasesRegion(page))).toHaveCount(1);
});

Given('deleting leases will fail', async ({ page }) => {
  await failLeaseRequests(page, 'DELETE');
});

// Display steps
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
  // Using a class selector as changing the client code is arguably better left to the migration
  await expect(theLease(page).locator('.lease__wrapper')).toContainClass('lease__inactive');
});

When('I hover over the lease', async ({ page }) => {
  await theLease(page).hover();
});

Then('I see a tooltip with {string}', async ({ page }, text: string) => {
  await expect(theLease(page).getByText(text)).toBeVisible();
});

// Saved leases steps
Then('the add lease control shows {string} while the lease is saved', async ({ page, testContext }, text: string) => {
  await expectShownDuringSave(page, testContext, text);
});

Then(
  'the image shows a(n) {string} lease with the notes {string}',
  async ({ page, testContext }, label: string, notes: string) => {
    await expect(leaseItem(leasesRegion(page), label).getByText(notes, { exact: true })).toBeVisible();
    await pollImageLeases(testContext).toContainEqual(
      expect.objectContaining({ access: accessOfLabel(label), notes }),
    );
  },
);

Then('the image shows a(n) {string} lease with no start date', async ({ page, testContext }, label: string) => {
  const lease = leaseItem(leasesRegion(page), label);
  await expect(lease).toBeVisible();
  await expect(lease.getByText(/^Start(s|ed) /)).toHaveCount(0);
  await expect
    .poll(async () =>
      (await imageLeases(testContext.imageId!)).map(({ access, startDate }) => ({ access, startDate: startDate ?? null })),
    { message: 'the leases media-api serves, with their start dates' })
    .toEqual([{ access: accessOfLabel(label), startDate: null }]);
});

Then(
  'the image shows a(n) {string} lease and no {string} lease',
  async ({ page, testContext }, shown: string, replaced: string) => {
    const region = leasesRegion(page);
    await expect(leaseItem(region, shown)).toBeVisible();
    await expect(leaseItem(region, replaced)).toHaveCount(0);
    await pollImageLeases(testContext).toEqual([expect.objectContaining({ access: accessOfLabel(shown) })]);
  },
);

Then('the image still has only its {string} lease', async ({ page, testContext }, label: string) => {
  expect(accesses(await unchangedImageLeases(testContext)), 'the leases media-api serves').toEqual([
    accessOfLabel(label),
  ]);
  await expect(leaseItems(leasesRegion(page))).toHaveCount(1);
  await expect(leaseItem(leasesRegion(page), label)).toBeVisible();
});

Then('the {string} lease is no longer shown', async ({ page, testContext }, label: string) => {
  await expect(leaseItem(leasesRegion(page), label)).toHaveCount(0);
  await pollImageLeases(testContext).not.toContainEqual(expect.objectContaining({ access: accessOfLabel(label) }));
});

Then('the {string} region shows a(n) {string} lease', async ({ page, testContext }, region: string, label: string) => {
  await expect(leaseItem(page.getByRole('region', { name: region, exact: true }), label)).toBeVisible();
  await pollImageLeases(testContext).toContainEqual(expect.objectContaining({ access: accessOfLabel(label) }));
});

// A confirm left unanswered stalls the page, and with it the fixtures' teardown.
After(async ({ testContext }) => {
  await testContext.heldConfirm?.dismiss().catch(() => {});
});
