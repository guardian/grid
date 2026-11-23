/**
 * Locators and seeding shared by the lease steps. The lease widget (kahuna/public/js/leases)
 * is the same on every surface, so locators take the surface's scope: the single image view's
 * "Leases" region, an info panel or an upload job.
 */
import type { Locator, Page } from '@playwright/test';
import { TEST_ACCOUNTS } from '../../setup/constants.ts';
import { findSeededImage, hasNoUsageRights } from '../../setup/image-fixtures.ts';
import { isLeaseAccess, seedLeases } from '../../setup/seed-leases.ts';
import type { LeaseAccess, SeedLease } from '../../setup/seed-leases.ts';
import type { SeedImage } from '../setup.ts';

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
