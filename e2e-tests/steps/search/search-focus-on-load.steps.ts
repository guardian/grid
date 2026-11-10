import { Then, When, expect } from '../setup.ts';
import { searchBoxEditable } from './search-box.ts';

Then('the search box should have keyboard focus', async ({ page }) => {
    await expect(searchBoxEditable(page)).toBeFocused();
});

When('I type {string} without clicking the search box', async ({ page }, text: string) => {
    await expect(searchBoxEditable(page)).toBeFocused();
    // Type into whatever has focus, so the caret Kahuna placed on load is what gets tested.
    await page.keyboard.type(text);
});

Then('the search box text should read {string}', async ({ page }, text: string) => {
    await expect(searchBoxEditable(page)).toHaveText(text);
});
