import { Then, When, expect } from '../setup.ts';
import { DEFAULT_SEARCH_INPUT, searchBoxEditable } from './search-box.ts';

Then('the search box should have keyboard focus', async ({ page, testContext }) => {
    await expect(searchBoxEditable(page, testContext.searchInput ?? DEFAULT_SEARCH_INPUT)).toBeFocused();
});

When('I type {string} without clicking the search box', async ({ page, testContext }, text: string) => {
    // The chips input focuses itself in a $timeout, so wait for it before typing.
    await expect(searchBoxEditable(page, testContext.searchInput ?? DEFAULT_SEARCH_INPUT)).toBeFocused();
    // Type into whatever has focus, so the caret Kahuna placed on load is what gets tested.
    await page.keyboard.type(text);
});

Then('the search box text should read {string}', async ({ page, testContext }, text: string) => {
    const input = testContext.searchInput ?? DEFAULT_SEARCH_INPUT;
    const editable = searchBoxEditable(page, input);
    if (input === 'cql') {
        await expect(editable).toHaveText(text);
    } else {
        await expect(editable).toHaveValue(text);
    }
});
