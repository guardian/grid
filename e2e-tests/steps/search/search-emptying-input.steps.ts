import { Then, When, expect } from '../setup.ts';
import { DEFAULT_SEARCH_INPUT, recordSearches, searchBoxEditable } from './search-box.ts';

When('I delete all the text in the search box', async ({ page, testContext }) => {
    recordSearches(page, testContext);
    const input = testContext.searchInput ?? DEFAULT_SEARCH_INPUT;
    const editable = searchBoxEditable(page, input);
    const text = input === 'cql' ? await editable.innerText() : await editable.inputValue();
    // The caret starts after the text (see search-focus-on-load.feature), so Backspace removes it all.
    for (let i = 0; i < text.length; i++) {
        await editable.press('Backspace');
    }
});

Then('a single search should be run with no search text', async ({ testContext }) => {
    const searchesRun = testContext.searchesRun ?? [];
    await expect.poll(() => searchesRun).toEqual(['']);
});
