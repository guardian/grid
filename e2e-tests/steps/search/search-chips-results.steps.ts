import type { DataTable } from 'playwright-bdd';
import type { Page } from '@playwright/test';
import { SEARCH_CHIP_CORE_IMAGE_IDS, SEARCH_CHIP_IMAGE_IDS } from '../../fixtures/elasticsearch/search-chips.ts';
import { DOMAIN } from '../../setup/constants.ts';
import { Given, When, Then, KAHUNA_APP_URL, expect } from '../setup.ts';
import { expectSearchBoxEmpty, isSearchRun, searchBoxEditable, searchBoxReady } from './search-box.ts';

async function openChipFixtureSearch(page: Page, fixtureIds: string[]) {
    const ids = fixtureIds.join(',');
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
}

Given('I am searching only the chip fixtures with all usage rights included', async ({ page }) => {
    await openChipFixtureSearch(page, Object.values(SEARCH_CHIP_CORE_IMAGE_IDS));
});

Given('I am searching chip fixtures {string} with all usage rights included', async ({ page }, roles: string) => {
    const ids = roles.split(',').map((role) => {
        const id = SEARCH_CHIP_IMAGE_IDS[role.trim()];
        expect(id, `Unknown chip fixture: ${role.trim()}`).toBeTruthy();
        return id;
    });
    await openChipFixtureSearch(page, ids);
});

Given('the seeded supplier quota report is available', async ({ page }) => {
    await expect.poll(async () => {
        const response = await page.request.get(`https://api.media.${DOMAIN}/usage/quotas`);
        if (!response.ok()) return null;
        const { data } = await response.json();
        return { aap: data.store?.AAP?.exceeded, rex: data.store?.['Rex Features']?.exceeded };
    }, { message: 'Wait for the seeded AAP and Rex quota counts' }).toEqual({ aap: true, rex: false });
});

When('I search for images using {string}', async ({ page }, query: string) => {
    const searched = page.waitForResponse((response) =>
        isSearchRun(response.request()) && new URL(response.url()).searchParams.get('q') === query);
    await searchBoxEditable(page).fill(query);
    expect((await searched).status()).toBe(200);
    await expect(page).toHaveURL((url) => url.searchParams.get('query') === query &&
        url.searchParams.get('nonFree') === 'true');
});

async function expectChipFixtures(page: Page, roles: string[]) {
    const ids = roles.map((role) => {
        const id = SEARCH_CHIP_IMAGE_IDS[role];
        expect(id, `Unknown chip fixture: ${role}`).toBeTruthy();
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
}

Then('the search results should contain exactly these chip fixtures:', async ({ page }, table: DataTable) => {
    await expectChipFixtures(page, table.hashes().map((row) => row.Fixture));
});

Then('the search results should contain exactly chip fixtures {string}', async ({ page }, roles: string) => {
    await expectChipFixtures(page, roles === 'none' ? [] : roles.split(',').map((role) => role.trim()));
});