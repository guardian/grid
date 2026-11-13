import type { Locator, Page } from '@playwright/test';
import { Given, When, Then, KAHUNA_APP_URL, expect } from '../setup.ts';
import { cqlInput, expectSearchBoxEmpty, recordSearches, searchBoxEditable, searchBoxReady } from './search-box.ts';
import { setTestClientConfig } from '../utils/test-config.ts';

function chip(page: Page, key: string): Locator {
    return cqlInput(page)
        .locator('chip-wrapper')
        .filter({ has: page.locator('chip-key').getByText(key, { exact: true }) });
}

function chipValue(page: Page, key: string): Locator {
    return chip(page, key).getByTestId('chip-value');
}

async function enterChipQuery(page: Page, query: string) {
    await searchBoxEditable(page).fill(query);
    await expect(page).toHaveURL((url) => url.searchParams.get('query') === query);
    await searchBoxEditable(page).press('Escape');
}

async function chooseIndexedValue(page: Page, key: 'credit' | 'photoshoot' | 'source', prefix: string) {
    await searchBoxEditable(page).pressSequentially(`+${key}:`);
    const lookup = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname === `/suggest/metadata/${key}` && url.searchParams.get('q') === prefix;
    });
    await chipValue(page, key).fill(prefix);
    expect((await lookup).status()).toBe(200);
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

Then('the filter suggestions should include {string}', async ({ page }, suggestion: string) => {
    await expect(cqlInput(page).locator('.Cql__TypeaheadPopover').getByText(suggestion, { exact: true })).toBeVisible();
});

Then('the filter suggestions should not include {string}', async ({ page }, suggestion: string) => {
    await expect(cqlInput(page).locator('.Cql__TypeaheadPopover').getByText(suggestion, { exact: true })).toHaveCount(0);
});

Given('the chip query is {string}', async ({ page, testContext }, query: string) => {
    recordSearches(page, testContext);
    await enterChipQuery(page, query);
});

Given('I am choosing a credit value starting with {string}', async ({ page, testContext }, prefix: string) => {
    recordSearches(page, testContext);
    await chooseIndexedValue(page, 'credit', prefix);
});

Given('I am choosing a photoshoot value starting with {string}', async ({ page }, prefix: string) => {
    await chooseIndexedValue(page, 'photoshoot', prefix);
});

Given('I am choosing a source value starting with {string}', async ({ page }, prefix: string) => {
    await chooseIndexedValue(page, 'source', prefix);
});

Given('optional search suggestion features are disabled', async ({ page }) => {
    await setTestClientConfig(page, {
        useReaper: false,
        agencyPicksIngredients: null,
        recordDownloadAsUsage: false,
        showSendToPhotoSales: false,
    });
    await searchBoxReady(page);
    await expectSearchBoxEmpty(page);
});

Given('I opened a chip search URL for {string}', async ({ page, testContext }, query: string) => {
    recordSearches(page, testContext);
    await page.goto(`${KAHUNA_APP_URL}/search?${new URLSearchParams({ query })}`);
    await searchBoxReady(page);
});

Given('I have chip search history from {string} to {string}', async ({ page, testContext }, first: string, second: string) => {
    recordSearches(page, testContext);
    await enterChipQuery(page, first);
    await enterChipQuery(page, second);
});

When('I enter the complete chip query {string}', async ({ page, testContext }, query: string) => {
    recordSearches(page, testContext);
    await enterChipQuery(page, query);
});

When('I replace the {string} chip value with the prefix {string}', async ({ page }, key: string, prefix: string) => {
    await chipValue(page, key).fill(prefix);
    await expect(cqlInput(page).locator('.Cql__TypeaheadPopover')).toBeVisible();
});

When('I negate the {string} chip', async ({ page }, key: string) => {
    await chip(page, key).getByTestId('polarity-handle').click();
});

When('I remove the {string} chip with its remove control', async ({ page }, key: string) => {
    await chip(page, key).locator('.Cql__ChipWrapperDeleteHandle').click();
});

When('I move left into the final chip and press Backspace', async ({ page }) => {
    const editor = searchBoxEditable(page);
    const value = cqlInput(page).locator('chip-wrapper').last().getByTestId('chip-value');
    const caretIsInValue = () => value.evaluate((element) => {
        const root = element.getRootNode() as ShadowRoot & { getSelection?: () => Selection | null };
        const selection = root.getSelection?.() ?? element.ownerDocument.getSelection();
        return Boolean(selection?.isCollapsed && selection.anchorNode && element.contains(selection.anchorNode));
    });
    await editor.press('Escape');
    await expect(cqlInput(page).locator('.Cql__TypeaheadPopover')).toBeHidden();
    await editor.press('Control+End');
    for (let attempt = 0; attempt < 3; attempt++) {
        await editor.press('ArrowLeft');
        if (await caretIsInValue()) break;
    }
    await expect.poll(caretIsInValue, { message: 'Caret must enter the chip value before deleting text' }).toBe(true);
    await editor.press('Backspace');
});

When('I press Backspace in the focused empty chip', async ({ page }) => {
    await searchBoxEditable(page).press('Backspace');
});

Then('the chip query should be {string}', async ({ page }, query: string) => {
    await expect(page).toHaveURL((url) => url.searchParams.get('query') === query);
    await expect(cqlInput(page)).toHaveAttribute('value', query);
});

Then('the chip query should be {string} with editor form {string}', async ({ page }, query: string, editorQuery: string) => {
    await expect(page).toHaveURL((url) => url.searchParams.get('query') === query);
    await expect(cqlInput(page)).toHaveAttribute('value', editorQuery);
});

Then('there should be exactly {int} filter chips', async ({ page }, count: number) => {
    await expect(cqlInput(page).locator('chip-wrapper')).toHaveCount(count);
});

Then('the {string} chip should be excluded', async ({ page }, key: string) => {
    await expect(chip(page, key).getByTestId('polarity-handle')).toHaveText('\u2212');
});

When('I request source suggestions for {string}', async ({ page }, prefix: string) => {
    await searchBoxEditable(page).pressSequentially('+source:');
    const lookup = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname === '/suggest/metadata/source' && url.searchParams.get('q') === prefix;
    });
    await chipValue(page, 'source').fill(prefix);
    expect((await lookup).status()).toBe(404);
});
