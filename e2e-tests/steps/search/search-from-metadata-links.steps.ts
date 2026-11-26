/** Steps for searching by clicking metadata and label links, with and without Shift/Alt held. */
import type { Locator, Page } from '@playwright/test';
import { SEARCH_CHIP_IMAGE_IDS } from '../../fixtures/elasticsearch/search-chips.ts';
import { loadImageFixtures } from '../../setup/image-fixtures.ts';
import type { ImageSource } from '../../setup/image-fixtures.ts';
import { updateImageCopy } from '../../setup/seed-image.ts';
import { Given, KAHUNA_APP_URL, Then, When, expect } from '../setup.ts';
import type { SeedImage, TestContext } from '../setup.ts';
import { answerDialogs } from '../utils/dialogs.ts';
import { resultCard, searchInfoPanel } from '../utils/search-results.ts';
import { imageInformation, openImage } from '../utils/single-image.ts';
import { isSearchRun, recordSearches, searchBoxReady } from './search-box.ts';

type ClickModifier = 'Shift' | 'Alt';

/** An agency image with free usage rights, whose description mentions "harbour". */
const harbourImage = (): ImageSource => {
  const id = SEARCH_CHIP_IMAGE_IDS['harbour-daylight-jpeg'];
  const hit = loadImageFixtures().find((h) => h._id === id);
  if (!hit) throw new Error(`Search chip fixture harbour-daylight-jpeg (${id}) is not seeded`);
  return hit._source;
};

/** Seed a copy of the harbour image with `metadata` merged over its own. */
function seedHarbourCopy(seedImage: SeedImage, metadata: Record<string, unknown>): Promise<string> {
  const source = harbourImage();
  return seedImage(source, { metadata: { ...source.metadata, ...metadata } });
}

/** Search for exactly `imageId`, with `query` as the search text, and wait for its card. */
async function showInSearch(page: Page, testContext: TestContext, imageId: string, query = '') {
  testContext.surfaceImageIds = [imageId];
  answerDialogs(page, testContext);
  const nonFree = testContext.searchNonFree ?? 'true';
  const params = new URLSearchParams({ ids: imageId, nonFree });
  if (query) params.set('query', query);
  const searched = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return isSearchRun(response.request()) &&
      url.searchParams.get('ids') === imageId &&
      (url.searchParams.get('q') ?? '') === query;
  });
  await page.goto(`${KAHUNA_APP_URL}/search?${params}`);
  expect((await searched).status()).toBe(200);
  await searchBoxReady(page);
  await expect(resultCard(page, imageId)).toBeVisible();
}

/**
 * Click `link`, holding `modifier` if given, recording the searches it runs. Recording starts
 * here so that only searches the click caused are asserted on.
 */
async function clickLink(page: Page, testContext: TestContext, link: Locator, modifier?: ClickModifier) {
  recordSearches(page, testContext);
  testContext.nextSearch = page.waitForRequest(isSearchRun).then((request) => new URL(request.url()));
  await link.click({ modifiers: modifier ? [modifier] : [] });
}

const infoPanelCredit = (page: Page, credit: string) =>
  searchInfoPanel(page).getByRole('link', { name: `Search images by ${credit} credit`, exact: true });

const infoPanelLabel = (page: Page, label: string) =>
  searchInfoPanel(page)
    .getByRole('region', { name: 'Labels', exact: true })
    .getByRole('link', { name: `Search images by ${label} label`, exact: true });

const searchedImageId = (testContext: TestContext): string => {
  const [id] = testContext.surfaceImageIds ?? [];
  expect(id, 'no image was shown in search results by an earlier step').toBeDefined();
  return id;
};

Given('all usage rights are {word} in my searches', async ({ testContext }, setting: string) => {
  if (setting !== 'included' && setting !== 'excluded') {
    throw new Error(`Expected "included" or "excluded", got "${setting}"`);
  }
  testContext.searchNonFree = setting === 'included' ? 'true' : 'false';
});

Given(
  'an image credited to {string} is shown in the search results',
  async ({ page, seedImage, testContext }, credit: string) => {
    await showInSearch(page, testContext, await seedHarbourCopy(seedImage, { credit }));
  },
);

Given(
  'an image credited to {string} is shown in the search results for {string}',
  async ({ page, seedImage, testContext }, credit: string, query: string) => {
    await showInSearch(page, testContext, await seedHarbourCopy(seedImage, { credit }), query);
  },
);

async function seedLabelledImage(seedImage: SeedImage, label: string): Promise<string> {
  const id = await seedHarbourCopy(seedImage, {});
  // Labels are user edits, which indexImageCopy leaves out, so add them as thrall would.
  await updateImageCopy(id, {
    userMetadata: { archived: false, labels: [label], metadata: {}, lastModified: new Date().toISOString() },
  });
  return id;
}

Given(
  'an image labelled {string} is shown in the search results',
  async ({ page, seedImage, testContext }, label: string) => {
    await showInSearch(page, testContext, await seedLabelledImage(seedImage, label));
  },
);

Given(
  'an image labelled {string} is shown in the search results for {string}',
  async ({ page, seedImage, testContext }, label: string, query: string) => {
    await showInSearch(page, testContext, await seedLabelledImage(seedImage, label), query);
  },
);

Given(
  'I have opened the single image view of an image with the byline {string}',
  async ({ page, seedImage, testContext }, byline: string) => {
    testContext.imageId = await seedHarbourCopy(seedImage, { byline });
    answerDialogs(page, testContext);
    await openImage(page, testContext.imageId);
  },
);

When(
  'I {word}-click the credit {string} in the info panel',
  async ({ page, testContext }, modifier: string, credit: string) => {
    await clickLink(page, testContext, infoPanelCredit(page, credit), modifierKey(modifier));
  },
);

When('I click the credit {string} in the info panel', async ({ page, testContext }, credit: string) => {
  await clickLink(page, testContext, infoPanelCredit(page, credit));
});

When(
  'I {word}-click the label {string} in the info panel',
  async ({ page, testContext }, modifier: string, label: string) => {
    await clickLink(page, testContext, infoPanelLabel(page, label), modifierKey(modifier));
  },
);

When('I click the label {string} in the info panel', async ({ page, testContext }, label: string) => {
  await clickLink(page, testContext, infoPanelLabel(page, label));
});

When(
  'I {word}-click the byline {string}',
  async ({ page, testContext }, modifier: string, byline: string) => {
    const link = imageInformation(page).getByRole('link', { name: `Search images by ${byline} byline`, exact: true });
    await clickLink(page, testContext, link, modifierKey(modifier));
  },
);

When('I click its label {string} on the thumbnail', async ({ page, testContext }, label: string) => {
  const card = resultCard(page, searchedImageId(testContext));
  // The compact labeller has no element name, so its links' names end "<label> ".
  const link = card.getByRole('link', { name: `Search images by ${label}` });
  await card.hover();
  await clickLink(page, testContext, link);
});

Then(
  'the new search should still {word} images with restricted usage rights',
  async ({ testContext }, expectation: string) => {
    if (expectation !== 'include' && expectation !== 'exclude') {
      throw new Error(`Expected "include" or "exclude", got "${expectation}"`);
    }
    expect(testContext.nextSearch, 'no metadata link was clicked by an earlier step').toBeDefined();
    const search = await testContext.nextSearch!;
    // media-api only returns free images when `free=true` is sent (kahuna/public/js/search/results.js).
    expect(search.searchParams.get('free')).toBe(expectation === 'include' ? null : 'true');
  },
);

function modifierKey(modifier: string): ClickModifier {
  if (modifier !== 'Shift' && modifier !== 'Alt') {
    throw new Error(`Expected "Shift" or "Alt", got "${modifier}"`);
  }
  return modifier;
}

// Entering the search page from the single image view searches twice, so allow repeats.
Then('every search run should be for {string}', async ({ testContext }, query: string) => {
  const searchesRun = testContext.searchesRun ?? [];
  await expect.poll(() => searchesRun.length).toBeGreaterThan(0);
  expect(new Set(searchesRun.filter((q) => q !== ''))).toEqual(new Set([query]));
});
