import { Then, When, expect } from '../setup.ts';
import { editSearchBox, recordSearches, searchBoxEditable } from './search-box.ts';

When('I delete all the text in the search box', async ({ page, testContext }) => {
    recordSearches(page, testContext);
    const text = await searchBoxEditable(page).innerText();
    // The caret starts after the text (see search-focus-on-load.feature), so Backspace removes it all.
    await editSearchBox(page, async (keyboard) => {
        for (let i = 0; i < text.length; i++) {
            await keyboard.press('Backspace');
        }
    });
});

Then('a single search should be run with no search text', async ({ testContext }) => {
    const searchesRun = testContext.searchesRun ?? [];
    await expect.poll(() => searchesRun).toEqual(['']);
});
