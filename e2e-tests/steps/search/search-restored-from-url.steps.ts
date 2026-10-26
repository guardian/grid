import type { Page } from '@playwright/test';
import { Given, Then, When, expect } from '../setup.ts';
import {
    DEFAULT_SEARCH_INPUT,
    type SearchInput,
    expectSearchBoxEmpty,
    searchBoxEditable,
} from './search-box.ts';

async function typeAndWaitForSearch(page: Page, input: SearchInput, text: string, query: string) {
    await searchBoxEditable(page, input).pressSequentially(text);
    await expect(page).toHaveURL((url) => url.searchParams.get('query') === query);
}

Given('I have searched for {string}', async ({ page, testContext }, query: string) => {
    await typeAndWaitForSearch(page, testContext.searchInput ?? DEFAULT_SEARCH_INPUT, query, query);
});

Given(
    'I have searched for {string} and then for {string}',
    async ({ page, testContext }, first: string, second: string) => {
        if (!second.startsWith(first)) {
            throw new Error(`"${second}" must carry on from "${first}" so it can be typed after it`);
        }
        const input = testContext.searchInput ?? DEFAULT_SEARCH_INPUT;
        await typeAndWaitForSearch(page, input, first, first);
        await typeAndWaitForSearch(page, input, second.slice(first.length), second);
    },
);

When('I go back in the browser', async ({ page }) => {
    await page.goBack();
});

Given('I have gone back in the browser', async ({ page }) => {
    await page.goBack();
});

When('I go forward in the browser', async ({ page }) => {
    await page.goForward();
});

Then('the search box should be empty', async ({ page, testContext }) => {
    await expectSearchBoxEmpty(page, testContext.searchInput ?? DEFAULT_SEARCH_INPUT);
});

Then('the page address should not have a query', async ({ page }) => {
    await expect(page).toHaveURL((url) => !url.searchParams.has('query'));
});
