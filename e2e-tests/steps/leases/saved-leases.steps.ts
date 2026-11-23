/** Steps checking what the leases service saved, as the single image view and media-api show it. */
import { imageLeases } from '../../setup/seed-leases.ts';
import { Then, expect } from '../setup.ts';
import {
  accessOfLabel,
  accesses,
  expectShownDuringSave,
  leaseItem,
  leaseItems,
  leasesRegion,
  pollImageLeases,
} from './leases.ts';

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
  await pollImageLeases(testContext).toEqual([expect.objectContaining({ access: accessOfLabel(label) })]);
  const [saved] = await imageLeases(testContext.imageId!);
  expect(saved.startDate ?? null, 'the saved start date').toBeNull();
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
  expect(testContext.leaseWrites, 'requests to change leases').toEqual([]);
  const items = leaseItems(leasesRegion(page));
  await expect(items).toHaveCount(1);
  await expect(leaseItem(leasesRegion(page), label)).toBeVisible();
  expect(accesses(await imageLeases(testContext.imageId!)), 'the leases media-api serves').toEqual([
    accessOfLabel(label),
  ]);
});

Then('the {string} lease is no longer shown', async ({ page, testContext }, label: string) => {
  await expect(leaseItem(leasesRegion(page), label)).toHaveCount(0);
  await pollImageLeases(testContext).not.toContainEqual(expect.objectContaining({ access: accessOfLabel(label) }));
});

Then('the {string} region shows a(n) {string} lease', async ({ page, testContext }, region: string, label: string) => {
  await expect(leaseItem(page.getByRole('region', { name: region, exact: true }), label)).toBeVisible();
  await pollImageLeases(testContext).toContainEqual(expect.objectContaining({ access: accessOfLabel(label) }));
});
