/** Steps for the lease widget in the search page's info panel, for one or several selected images. */
import type { Page } from '@playwright/test';
import type { SeedLease } from '../../setup/seed-leases.ts';
import { Given, KAHUNA_APP_URL, Then, When, expect } from '../setup.ts';
import type { SeedImage, TestContext } from '../setup.ts';
import { answerDialogs } from '../utils/dialogs.ts';
import {
  accessOfLabel,
  addLease,
  leaseItem,
  leaseItems,
  pollLeasesOf,
  seedLeasedImage,
} from './leases.ts';

const results = (page: Page) => page.getByRole('region', { name: 'Matched image search results' });

/**
 * Search results' cards: the list items holding a thumbnail. The pop-out link each holds,
 * shown on hover, sits in a list item of its own, which has none.
 */
const resultCards = (page: Page) =>
  results(page).getByRole('listitem').filter({ has: page.getByRole('img') });

/** The card of `imageId`, found by its pop-out link, which is there even while selecting. */
const resultCard = (page: Page, imageId: string) =>
  resultCards(page).filter({ has: page.locator(`a[href="/images/${imageId}"]`) });

const infoPanel = (page: Page) => page.getByRole('region', { name: 'Image information' });

const infoPanelRegion = (page: Page, name: string) =>
  infoPanel(page).getByRole('region', { name, exact: true });

const infoPanelLeases = (page: Page) => infoPanelRegion(page, 'Leases');

const searchImageIds = (testContext: TestContext): string[] => {
  expect(testContext.surfaceImageIds, 'no images were shown in search results by an earlier step').toBeDefined();
  return testContext.surfaceImageIds!;
};

/** Seed an image for each entry of `leasesPerImage`, and search for exactly those images. */
async function showInSearch(
  { page, seedImage, testContext }: { page: Page; seedImage: SeedImage; testContext: TestContext },
  leasesPerImage: SeedLease[][],
): Promise<void> {
  const ids = await Promise.all(leasesPerImage.map((leases) => seedLeasedImage(seedImage, leases)));
  testContext.surfaceImageIds = ids;
  answerDialogs(page, testContext);
  // The copies have no usage rights, which the default free-only search leaves out.
  await page.goto(`${KAHUNA_APP_URL}/search?ids=${ids.join(',')}&nonFree=true`);
  await expect(resultCards(page)).toHaveCount(ids.length);
}

/**
 * Select each image, as a user would: the first by its checkbox, the rest by clicking them, then
 * open the info panel.
 */
async function selectImages(page: Page, ids: string[]): Promise<void> {
  for (const [index, id] of ids.entries()) {
    const card = resultCard(page, id);
    if (index === 0) {
      // The checkbox only shows while the card is hovered. Kahuna hides the input itself with
      // `visibility: hidden` (main.css), so it has no role to find it by; users click the icon
      // label that sits over it.
      await card.hover();
      await card.locator('.result__select__checkbox__label').click();
    } else {
      // Once an image is selected, clicking another image toggles its selection.
      await card.click();
    }
    // The checkbox only shows while the card is hovered.
    await expect(card.getByRole('checkbox', { includeHidden: true })).toBeChecked();
  }
  // The info panel starts collapsed off-screen, so open it to work with the selection.
  await page.getByRole('button', { name: 'Show info panel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Hide info panel', exact: true })).toBeVisible();
}

Given('an image with no leases is shown in search results', async ({ page, seedImage, testContext }) => {
  await showInSearch({ page, seedImage, testContext }, [[]]);
});

Given('{int} images with leases are shown in search results', async ({ page, seedImage, testContext }, count: number) => {
  await showInSearch({ page, seedImage, testContext }, Array.from({ length: count }, () => [{ access: 'allow-use' as const }]));
});

Given('{int} images with no leases are shown in search results', async ({ page, seedImage, testContext }, count: number) => {
  await showInSearch({ page, seedImage, testContext }, Array.from({ length: count }, () => []));
});

Given(
  '{int} images are shown in search results and one has a syndication lease',
  async ({ page, seedImage, testContext }, count: number) => {
    await showInSearch({ page, seedImage, testContext }, [
      [{ access: 'deny-syndication' }],
      ...Array.from({ length: count - 1 }, () => []),
    ]);
  },
);

Given('I( have) select(ed) the/both image(s)', async ({ page, testContext }) => {
  await selectImages(page, searchImageIds(testContext));
});

When('I add a(n) {string} lease from the info panel', async ({ page, testContext }, access: string) => {
  await addLease(page, testContext, infoPanelLeases(page), access);
});

When(
  'I select both images and add a(n) {string} lease',
  async ({ page, testContext }, access: string) => {
    await selectImages(page, searchImageIds(testContext));
    await addLease(page, testContext, infoPanelLeases(page), access);
  },
);

Then(
  "the info panel's {string} region shows a(n) {string} lease",
  async ({ page, testContext }, region: string, label: string) => {
    await expect(leaseItem(infoPanelRegion(page, region), label)).toBeVisible();
    for (const id of searchImageIds(testContext)) {
      await pollLeasesOf(id).toContainEqual(expect.objectContaining({ access: accessOfLabel(label) }));
    }
  },
);

Then("the info panel's {string} region shows {string}", async ({ page }, region: string, text: string) => {
  // getByText normalises whitespace, so the blank counts' doubled spaces match either way.
  await expect(infoPanelRegion(page, region).getByText(text, { exact: true })).toBeVisible();
});

Then('no individual leases are listed', async ({ page }) => {
  await expect(leaseItems(infoPanelLeases(page))).toHaveCount(0);
});

Then('each image has a(n) {string} lease', async ({ testContext }, label: string) => {
  for (const id of searchImageIds(testContext)) {
    await pollLeasesOf(id).toContainEqual(expect.objectContaining({ access: accessOfLabel(label) }));
  }
});
