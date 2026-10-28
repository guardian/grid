import type { Locator, Page } from '@playwright/test';
import { Given, When, Then, expect } from '../setup.ts';
import { cqlInput, expectSearchBoxEmpty, searchBoxEditable } from './search-box.ts';

function chipValue(page: Page, key: string): Locator {
    return cqlInput(page)
        .locator('chip-wrapper')
        .filter({ has: page.locator('chip-key').getByText(key, { exact: true }) })
        .getByTestId('chip-value');
}

Given('I am choosing a filter field with the partial name {string}', async ({ page }, partialName: string) => {
    await expectSearchBoxEmpty(page);
    await searchBoxEditable(page).pressSequentially(`+${partialName}`);
    await expect(cqlInput(page).locator('.Cql__TypeaheadPopover')).toBeVisible();
});

Given('I am choosing a value for the {string} filter', async ({ page }, key: string) => {
    await expectSearchBoxEmpty(page);
    await searchBoxEditable(page).pressSequentially(`+${key}:`);
    await expect(cqlInput(page).locator('.Cql__TypeaheadPopover')).toBeVisible();
});

When('I choose {string} from the filter field/value suggestions', async ({ page }, suggestion: string) => {
    await cqlInput(page)
        .locator('.Cql__TypeaheadPopover')
        .getByText(suggestion, { exact: true })
        .click();
});

Then('the {string} filter chip should have the value {string}', async ({ page }, key: string, value: string) => {
    await expect(chipValue(page, key)).toHaveText(value);
});

Then('the {string} filter chip should be waiting for a value', async ({ page }, key: string) => {
    await expect(chipValue(page, key)).toBeVisible();
    await expect(chipValue(page, key)).toHaveText('');
});