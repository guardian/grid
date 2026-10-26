import { Then, When, expect } from '../setup.ts';
import { DEFAULT_SEARCH_INPUT, recordSearches, searchBoxEditable } from './search-box.ts';

// Kahuna waits 500 ms after the last change before searching; allow time for the request to go out.
const SEARCH_SETTLE_MS = 1_500;

When('I type {string} and quickly delete it again', async ({ page, testContext }, text: string) => {
    recordSearches(page, testContext);
    const editable = searchBoxEditable(page, testContext.searchInput ?? DEFAULT_SEARCH_INPUT);
    await editable.pressSequentially(text);
    for (let i = 0; i < text.length; i++) {
        await editable.press('Backspace');
    }
});

Then('the page address should have the query {string}', async ({ page }, query: string) => {
    await expect(page).toHaveURL((url) => url.searchParams.get('query') === query);
});

Then('a single search should be run for {string}', async ({ testContext }, query: string) => {
    const searchesRun = testContext.searchesRun ?? [];
    await expect.poll(() => searchesRun.filter((q) => q === query).length).toBe(1);
    // An empty-box search from page load can land after recording starts, so ignore it.
    expect(searchesRun.filter((q) => q !== '')).toEqual([query]);
});

Then('the search should not be run again', async ({ page, testContext }) => {
    // Proving a search didn't happen needs a fixed wait past Kahuna's debounce.
    await page.waitForTimeout(SEARCH_SETTLE_MS);
    expect(testContext.searchesRun ?? []).toEqual([]);
});
