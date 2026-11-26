/**
 * Locators and seeding shared by the lease steps. The lease widget (kahuna/public/js/leases)
 * is the same on every surface, so locators take the surface's scope: the single image view's
 * "Leases" region, an info panel or an upload job.
 */
import type { Locator, Page } from '@playwright/test';
import { imageLeases, isLeaseAccess, seedLeases, storedLeases } from '../../setup/seed-leases.ts';
import type { LeaseAccess, SeedLease } from '../../setup/seed-leases.ts';
import { expect } from '../setup.ts';
import { holdingConfirms } from '../utils/dialogs.ts';
import { failRequests, holdRequests } from '../utils/routes.ts';
import type { RequestMatch } from '../utils/routes.ts';
import { PLAIN_IMAGE } from '../utils/single-image.ts';
import type { SeedImage, TestContext } from '../setup.ts';
import type { ImageOverrides } from '../../setup/seed-image.ts';

type Scope = Page | Locator;

/** Index a disposable copy of an image, with `overrides` applied and `leases`, and return its id. */
export async function seedLeasedImage(
  seedImage: SeedImage,
  leases: SeedLease[] = [],
  overrides?: ImageOverrides,
): Promise<string> {
  const id = await seedImage(PLAIN_IMAGE._source, overrides);
  await seedLeases(id, leases);
  return id;
}

/** Narrow a feature file's access type (e.g. "allow-use") to a LeaseAccess. */
export function leaseAccess(access: string): LeaseAccess {
  if (!isLeaseAccess(access)) throw new Error(`"${access}" is not a lease access type`);
  return access;
}

const pageOf = (scope: Scope): Page => ('page' in scope ? scope.page() : scope);

export const leasesRegion = (page: Page) =>
  page.getByRole('region', { name: 'Leases', exact: true });

export const addLeaseButton = (scope: Scope) =>
  scope.getByRole('button', { name: 'Add lease to image', exact: true });

/** The add lease form's access select. The form has no accessible name, so find it by its prompt. */
export const accessSelect = (scope: Scope) =>
  scope.getByRole('combobox').filter({
    has: pageOf(scope).getByRole('option', { name: 'Please select access', exact: true }),
  });

export const saveLeaseButton = (scope: Scope) => scope.getByTitle('Save new lease', { exact: true });

export const closeLeaseFormButton = (scope: Scope) => scope.getByTitle('Close', { exact: true });

export const leaseItems = (scope: Scope) => scope.getByRole('listitem');

/** leases.html describes a lease a template would add with this. */
export const LEASE_PREVIEW_DESCRIPTION = 'Preview: added by template';

/** The lease whose access is labelled `label`, e.g. "Allow use". */
export const leaseItem = (scope: Scope, label: string) =>
  leaseItems(scope).filter({ has: pageOf(scope).getByText(label, { exact: true }) });

export const applyLeasesToAllButton = (scope: Scope) =>
  scope.getByRole('button', { name: 'Apply these leases to all current uploads', exact: true });

export const removeAllLeasesButton = (scope: Scope) =>
  scope.getByRole('button', { name: 'Remove all leases', exact: true });

/** gr-confirm-delete's button, which is labelled "Delete image" wherever it is used. */
export const deleteLeaseControl = (scope: Scope) =>
  leaseItems(scope).getByRole('button', { name: 'Delete image', exact: true });

/**
 * The button that opens a gu-date picker, named by its icon ("event"), its `label` (e.g. "to")
 * and the date it shows.
 */
export const datePickerButton = (scope: Scope, label: string) =>
  scope.getByRole('button', { name: new RegExp(`^event ${label} `) });

const leasesService = (methods?: string[]): RequestMatch => ({
  url: (url) => url.hostname.startsWith('media-leases.'),
  methods,
});

const LEASE_WRITES = ['POST', 'PUT', 'DELETE'];

/**
 * Record what `testContext.watchDuringWrites` (by default the single image view's add lease
 * control) showed while each lease save was in flight in `testContext.shownDuringWrites`, so
 * steps can check what it showed during a save without racing it. The lease features' Before
 * hook calls this for every scenario.
 */
export async function recordShownDuringSaves(page: Page, testContext: TestContext): Promise<void> {
  testContext.shownDuringWrites = [];
  // The request is held until this resolves, so this reads the control mid-save.
  await holdRequests(page, leasesService(LEASE_WRITES), async () => {
    const watched = testContext.watchDuringWrites ?? addLeaseButton(leasesRegion(page));
    testContext.shownDuringWrites!.push(await watched.innerText({ timeout: 1_000 }).catch(() => ''));
  });
}

/** Make the leases service fail every `method` request the page sends it. */
export async function failLeaseRequests(page: Page, method: 'POST' | 'DELETE'): Promise<void> {
  await failRequests(page, leasesService([method]), {
    status: 500,
    json: { errorKey: 'e2e-failure', errorMessage: 'Failed by the e2e test' },
    cors: true,
  });
}

/** Short month names, as Kahuna's moment formats show them. */
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The access type a feature file's label (e.g. "Allow use") stands for. */
export const accessOfLabel = (label: string): LeaseAccess =>
  leaseAccess(label.toLowerCase().replace(' ', '-'));

/** Thrall copies saved leases into the image asynchronously, so poll media-api for them. */
export const pollLeasesOf = (imageId: string) =>
  expect.poll(async () => imageLeases(imageId), { message: `the leases media-api serves for ${imageId}` });

/** pollLeasesOf the image a scenario opened. */
export const pollImageLeases = (testContext: TestContext) => pollLeasesOf(testContext.imageId!);

/**
 * The leases stored for the image a scenario opened. Polling media-api can't show something
 * did not happen, as thrall may apply a change later; the leases service stores a change
 * before it responds, so one read of it is enough.
 */
export const storedImageLeases = (testContext: TestContext): Promise<SeedLease[]> =>
  storedLeases(testContext.imageId!);

export const accesses = (leases: SeedLease[]) => leases.map(({ access }) => access).sort();

/**
 * `watched` (by default the single image view's add lease control) showed `text` while a lease
 * was being saved, and stopped once it was.
 */
export async function expectShownDuringSave(
  page: Page,
  testContext: TestContext,
  text: string,
  watched: Locator = addLeaseButton(leasesRegion(page)),
): Promise<void> {
  // Kahuna refreshes the image before it sends the save, so wait for the save to be sent.
  await expect
    .poll(() => testContext.shownDuringWrites, { message: 'what was shown while saving' })
    .toContainEqual(expect.stringContaining(text));
  // Kahuna hides "Updating..." with ng-show or ng-if; innerText leaves out either.
  await expect(watched).not.toContainText(text, { useInnerText: true });
}

export const notesField = (scope: Locator) => scope.getByPlaceholder('Notes...', { exact: true });

/** Open the add lease form of the lease widget in `scope`. */
export async function openAddLeaseForm(scope: Locator): Promise<void> {
  await addLeaseButton(scope).click();
  await expect(accessSelect(scope)).toBeVisible();
}

export async function chooseAccess(testContext: TestContext, scope: Locator, access: string): Promise<void> {
  testContext.accessChosenAt = new Date();
  await accessSelect(scope).selectOption({ label: access });
}

/**
 * Add a lease through the form of the lease widget in `scope`. A syndication lease on an image
 * that has one raises a confirm, which is held for a later step to answer (see holdingConfirms).
 */
export async function addLease(
  page: Page,
  testContext: TestContext,
  scope: Locator,
  access: string,
  { ticked = [], notes }: { ticked?: string[]; notes?: string } = {},
): Promise<void> {
  await openAddLeaseForm(scope);
  await chooseAccess(testContext, scope, access);
  testContext.watchDuringWrites = addLeaseButton(scope);
  for (const checkbox of ticked) {
    await scope.getByRole('checkbox', { name: checkbox, exact: true }).check();
  }
  if (notes !== undefined) await notesField(scope).fill(notes);
  await holdingConfirms(page, testContext, () => saveLeaseButton(scope).click());
}

/** The label Kahuna shows for an access type, e.g. "Allow use" for "allow-use". */
export const labelOfAccess = (access: string): string => {
  const label = leaseAccess(access).replace('-', ' ');
  return label[0].toUpperCase() + label.slice(1);
};
