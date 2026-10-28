import type { DataTable } from 'playwright-bdd';
import { SEARCH_CHIP_IMAGE_IDS } from '../../fixtures/elasticsearch/search-chips.ts';
import { Given, When, Then, KAHUNA_APP_URL, expect } from '../setup.ts';
import { expectSearchBoxEmpty, isSearchRun, searchBoxEditable, searchBoxReady } from './search-box.ts';

Given('I am searching only the chip fixtures with all usage rights included', async ({ page }) => {
    const ids = Object.values(SEARCH_CHIP_IMAGE_IDS).join(',');
    const params = new URLSearchParams({ ids, nonFree: 'true' });
    const searched = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return isSearchRun(response.request()) && url.searchParams.get('ids') === ids &&
            (url.searchParams.get('q') ?? '') === '';
    });
    await page.goto(`${KAHUNA_APP_URL}/search?${params}`);
    expect((await searched).status()).toBe(200);
    await searchBoxReady(page);
    await expectSearchBoxEmpty(page);
    await expect(page).toHaveURL((url) => url.searchParams.get('nonFree') === 'true' &&
        url.searchParams.get('ids') === ids);
});

When('I search for images using {string}', async ({ page }, query: string) => {
    const searched = page.waitForResponse((response) =>
        isSearchRun(response.request()) && new URL(response.url()).searchParams.get('q') === query);
    await searchBoxEditable(page).fill(query);
    expect((await searched).status()).toBe(200);
    await expect(page).toHaveURL((url) => url.searchParams.get('query') === query &&
        url.searchParams.get('nonFree') === 'true');
});

Then('the search results should contain exactly these chip fixtures:', async ({ page }, table: DataTable) => {
    const ids = table.hashes().map((row) => {
        const id = SEARCH_CHIP_IMAGE_IDS[row.Fixture];
        expect(id, `Unknown chip fixture: ${row.Fixture}`).toBeTruthy();
        return id;
    });
    await expect(page.locator('.image-results-count').getByText(`${ids.length} matches`, { exact: true })).toBeVisible();
    const results = page.locator('.result');
    await expect(results).toHaveCount(ids.length);
    for (const id of ids) {
        await expect(results.filter({
            has: page.locator(`[id^="id-${id}-result__select__checkbox--"]`),
        })).toBeVisible();
    }
});