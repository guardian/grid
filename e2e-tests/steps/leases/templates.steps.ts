/** Steps for the leases a metadata template previews and applies in the single image view. */
import type { Page } from '@playwright/test';
import { E2E_LEASE_TEMPLATES } from '../../setup/config.ts';
import { Given, Then, When, expect } from '../setup.ts';
import type { TestContext } from '../setup.ts';
import {
  chooseMetadataTemplate,
  expectMetadataTemplate,
  metadataTemplates,
} from '../utils/metadata-templates.ts';
import {
  deleteLeaseControl,
  expectShownDuringSave,
  labelOfAccess,
  LEASE_PREVIEW_DESCRIPTION,
  leaseAccess,
  leaseItem,
  leaseItems,
  leasesRegion,
  pollImageLeases,
} from './leases.ts';

function chooseTemplate(testContext: TestContext, access: string, replace: boolean): void {
  const template = E2E_LEASE_TEMPLATES.find(
    (t) => t.leaseType === leaseAccess(access) && t.replace === replace,
  );
  expect(template, `a template that ${replace ? 'replaces existing leases with' : 'adds'} a "${access}" lease`).toBeDefined();
  testContext.metadataTemplate = template!.templateName;
}

async function selectTemplate(page: Page, testContext: TestContext): Promise<void> {
  expect(testContext.metadataTemplate, 'no metadata template was chosen by an earlier step').toBeDefined();
  await expectMetadataTemplate(page, testContext.metadataTemplate!);
  await chooseMetadataTemplate(page, testContext.metadataTemplate!);
}

Given(
  'a metadata template adds (leases with )a {string} lease( without replacing existing leases)',
  ({ testContext }, access: string) => chooseTemplate(testContext, access, false),
);

Given(
  'a metadata template replaces existing leases with a {string} lease',
  ({ testContext }, access: string) => chooseTemplate(testContext, access, true),
);

When('I select that metadata template', async ({ page, testContext }) => {
  await selectTemplate(page, testContext);
});

When('I apply that metadata template', async ({ page, testContext }) => {
  await selectTemplate(page, testContext);
  await metadataTemplates(page).getByTitle('Apply template', { exact: true }).click();
});

Then('the {string} lease is shown highlighted as a preview', async ({ page }, label: string) => {
  await expect(leaseItem(leasesRegion(page), label)).toHaveAccessibleDescription(LEASE_PREVIEW_DESCRIPTION);
});

Then('the existing {string} lease is still shown', async ({ page }, label: string) => {
  const lease = leaseItem(leasesRegion(page), label);
  await expect(lease).toBeVisible();
  await expect(lease).not.toHaveAccessibleDescription(LEASE_PREVIEW_DESCRIPTION);
});

Then('no delete controls are shown on the leases', async ({ page }) => {
  const region = leasesRegion(page);
  await expect(leaseItems(region).first()).toBeVisible();
  await expect(deleteLeaseControl(region)).toHaveCount(0);
});

Then('only the {string} lease is shown, highlighted as a preview', async ({ page }, label: string) => {
  const region = leasesRegion(page);
  await expect(leaseItem(region, label)).toHaveAccessibleDescription(LEASE_PREVIEW_DESCRIPTION);
  await expect(leaseItems(region)).toHaveCount(1);
});

Then(
  'the existing lease should be shown alongside the {string} lease, highlighted as a preview',
  async ({ page, testContext }, existing: string) => {
    const region = leasesRegion(page);
    const { leaseType } = E2E_LEASE_TEMPLATES.find((t) => t.templateName === testContext.metadataTemplate)!;
    await expect(leaseItem(region, labelOfAccess(leaseType))).toHaveAccessibleDescription(
      LEASE_PREVIEW_DESCRIPTION,
    );
    const existingLease = leaseItem(region, labelOfAccess(existing));
    await expect(existingLease).toBeVisible();
    await expect(existingLease).not.toHaveAccessibleDescription(LEASE_PREVIEW_DESCRIPTION);
    await expect(leaseItems(region)).toHaveCount(2);
  },
);

Then(
  'the add lease control shows {string} until the leases are saved',
  async ({ page, testContext }, text: string) => {
    await expectShownDuringSave(page, testContext, text);
    const { leaseType } = E2E_LEASE_TEMPLATES.find((t) => t.templateName === testContext.metadataTemplate)!;
    await pollImageLeases(testContext).toContainEqual(expect.objectContaining({ access: leaseType }));
  },
);
