/** Steps for the add lease form in the single image view. */
import type { Page } from '@playwright/test';
import { imageLeases } from '../../setup/seed-leases.ts';
import { Given, Then, When, expect } from '../setup.ts';
import { answerHeldConfirm } from '../utils/dialogs.ts';
import type { TestContext } from '../setup.ts';
import {
  MONTHS,
  accessSelect,
  addLease,
  chooseAccess,
  closeLeaseFormButton,
  datePickerButton,
  failLeaseRequests,
  leaseItems,
  leasesRegion,
  notesField,
  openAddLeaseForm,
  saveLeaseButton,
} from './leases.ts';

const pad = (n: number) => String(n).padStart(2, '0');

/** A date as gu-date shows it (DD MMM YYYY HH:mm), in this machine's (and the browser's) time zone. */
const guDateDisplay = (date: Date) =>
  `${pad(date.getDate())} ${MONTHS[date.getMonth()]} ${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;

const endOfDayAfterTomorrow = (from: Date) =>
  new Date(from.getFullYear(), from.getMonth(), from.getDate() + 2, 23, 59);

/** The image has only the leases it was opened with (none), and nothing tried to change them. */
async function expectNoLeasesSaved(page: Page, testContext: TestContext): Promise<void> {
  expect(testContext.leaseWrites, 'requests to change leases').toEqual([]);
  await expect(leaseItems(leasesRegion(page))).toHaveCount(0);
  expect(await imageLeases(testContext.imageId!), 'the leases media-api serves').toEqual([]);
}

When('I choose to add a lease', async ({ page, testContext }) => {
  await openAddLeaseForm(page, testContext, leasesRegion(page));
});

Given('the add lease form is open', async ({ page, testContext }) => {
  await openAddLeaseForm(page, testContext, leasesRegion(page));
});

Then('the add lease form is shown with {string} selected', async ({ page }, option: string) => {
  const select = accessSelect(leasesRegion(page));
  await expect(select).toBeVisible();
  await expect(select.locator('option:checked')).toHaveText(option);
});

Then(
  'the access options are grouped as Usage {string}, {string} and Syndication {string}, {string}',
  async ({ page }, allowUse: string, denyUse: string, allowSyndication: string, denySyndication: string) => {
    const select = accessSelect(leasesRegion(page));
    // Playwright gives <optgroup> no role, so find each group by its label.
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

Then("the image's leases are unchanged", async ({ page, testContext }) => {
  await expectNoLeasesSaved(page, testContext);
});

Then('no lease is added to the image', async ({ page, testContext }) => {
  await expectNoLeasesSaved(page, testContext);
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
  // Pikaday marks the days before its minimum date `is-disabled`, and opens on the minimum
  // date's month, so the first choosable day it shows is the earliest one.
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
