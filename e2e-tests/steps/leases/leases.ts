/**
 * Locators and seeding shared by the lease steps. The lease widget (kahuna/public/js/leases)
 * is the same on every surface, so locators take the surface's scope: the single image view's
 * "Leases" region, an info panel or an upload job.
 */
import type { Locator, Page } from '@playwright/test';
import { TEST_ACCOUNTS } from '../../setup/constants.ts';
import { findSeededImage, hasNoUsageRights } from '../../setup/image-fixtures.ts';
import { imageLeases, isLeaseAccess, seedLeases } from '../../setup/seed-leases.ts';
import type { LeaseAccess, MediaLease, SeedLease } from '../../setup/seed-leases.ts';
import { KAHUNA_APP_URL, expect } from '../setup.ts';
import { holdingConfirms } from '../utils/dialogs.ts';
import type { SeedImage, TestContext } from '../setup.ts';

type Scope = Page | Locator;

/** Not uploaded by a test account, so only edit_metadata grants editing its leases. */
const LEASE_IMAGE = findSeededImage(
  'with no usage rights, not uploaded by a test account',
  (source) =>
    hasNoUsageRights(source) &&
    !(Object.values(TEST_ACCOUNTS) as unknown[]).includes(source.uploadedBy),
);

/** Index a disposable copy of an image with `leases`, and return its id. */
export async function seedLeasedImage(seedImage: SeedImage, leases: SeedLease[] = []): Promise<string> {
  const id = await seedImage(LEASE_IMAGE._source);
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

const isLeasesService = (url: string | URL) => new URL(url).hostname.startsWith('media-leases.');

const recording = new WeakSet<Page>();

const isLeaseWrite = (method: string) => ['POST', 'PUT', 'DELETE'].includes(method);

/**
 * Record each request the page sends to change leases in `testContext.leaseWrites`, so steps
 * can check nothing was saved, and what `testContext.watchDuringWrites` (by default the single
 * image view's add lease control) showed while each was in flight in
 * `testContext.shownDuringWrites`, so steps can check what it showed during a save without
 * racing it. Idempotent, so steps sharing a page can each call it.
 */
export async function recordLeaseWrites(page: Page, testContext: TestContext): Promise<void> {
  testContext.leaseWrites ??= [];
  testContext.shownDuringWrites ??= [];
  if (recording.has(page)) return;
  recording.add(page);
  // A request listener sees requests that a later route fails, too.
  page.on('request', (request) => {
    if (isLeasesService(request.url()) && isLeaseWrite(request.method())) {
      testContext.leaseWrites!.push(`${request.method()} ${new URL(request.url()).pathname}`);
    }
  });
  await page.route(isLeasesService, async (route) => {
    if (isLeaseWrite(route.request().method())) {
      // The request is held until the route resolves, so this is the control mid-save.
      const watched = testContext.watchDuringWrites ?? addLeaseButton(leasesRegion(page));
      testContext.shownDuringWrites!.push(await watched.innerText({ timeout: 1_000 }).catch(() => ''));
    }
    await route.fallback();
  });
}

/** Make the leases service fail every `method` request the page sends it. */
export async function failLeaseRequests(page: Page, method: 'POST' | 'DELETE'): Promise<void> {
  await page.route(isLeasesService, async (route) => {
    if (route.request().method() !== method) return route.fallback();
    await route.fulfill({
      status: 500,
      // Readable cross-origin, so Kahuna sees the failure rather than a CORS error.
      headers: {
        'Access-Control-Allow-Origin': KAHUNA_APP_URL,
        'Access-Control-Allow-Credentials': 'true',
      },
      json: { errorKey: 'e2e-failure', errorMessage: 'Failed by the e2e test' },
    });
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

export const accesses = (leases: MediaLease[]) => leases.map(({ access }) => access).sort();

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
export async function openAddLeaseForm(page: Page, testContext: TestContext, scope: Locator): Promise<void> {
  await recordLeaseWrites(page, testContext);
  // The lease widget fetches the image's leases on load, and closes the form when that
  // resolves (LeasesCtrl.updateLeases), so a form opened sooner snaps shut. With no leases
  // nothing on the page shows the fetch is done, so wait for the page's requests to settle.
  await page.waitForLoadState('networkidle');
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
  await openAddLeaseForm(page, testContext, scope);
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
