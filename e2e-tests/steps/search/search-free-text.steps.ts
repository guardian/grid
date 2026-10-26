import { Given, Then, When, KAHUNA_APP_URL, expect } from '../setup.ts';
import { setTestClientConfig } from '../utils/test-config.ts';
import {
  cqlInput,
  cqlPlaceholder,
  expectSearchBoxEmpty,
  isSearchRun,
  recordSearches,
  searchBoxReady,
  searchRegion,
} from './search-box.ts';

function enabledDisabled(value: string): boolean {
  if (value !== 'enabled' && value !== 'disabled') {
    throw new Error(`Expected "enabled" or "disabled", got "${value}"`);
  }
  return value === 'enabled';
}

Given('I have opened the image search page', async ({ page }) => {
  await page.goto(`${KAHUNA_APP_URL}/search`);
  await searchBoxReady(page);
});

Given('AI search is {word}', async ({ page }, state: string) => {
  // Overrides `aiSearchEnabled` in window._clientConfig (kahuna/app/views/main.scala.html) and reloads.
  await setTestClientConfig(page, { aiSearchEnabled: enabledDisabled(state) });
  await searchBoxReady(page);
});

Given('the search box is empty', async ({ page }) => {
  await expectSearchBoxEmpty(page);
});

Given('the {string} checkbox is ticked', async ({ page }, name: string) => {
  const checkbox = searchRegion(page).getByRole('checkbox', { name });
  await checkbox.check();
  await expect(checkbox).toBeChecked();
});

When('I type {string} into the search box', async ({ page, testContext }, text: string) => {
  recordSearches(page, testContext);
  await cqlInput(page).locator('.Cql__ContentEditable').pressSequentially(text);
});

When('I tick the {string} checkbox', async ({ page }, name: string) => {
  await searchRegion(page).getByRole('checkbox', { name }).check();
});

When('I untick the {string} checkbox', async ({ page }, name: string) => {
  await searchRegion(page).getByRole('checkbox', { name }).uncheck();
});

When('I open a search link with the query {string}', async ({ page }, query: string) => {
  // Wait for the link's own search so later steps don't mistake it for a new one.
  const searched = page.waitForRequest(isSearchRun);
  await page.goto(`${KAHUNA_APP_URL}/search?query=${encodeURIComponent(query)}`);
  await searched;
  await searchBoxReady(page);
});

When('I open a search link with AI search turned on', async ({ page }) => {
  await page.goto(`${KAHUNA_APP_URL}/search?useAISearch=true`);
  await searchBoxReady(page);
});

Then('the search box placeholder should read {string}', async ({ page }, text: string) => {
  await expect(cqlPlaceholder(page)).toBeVisible();
  await expect(cqlPlaceholder(page)).toHaveText(text);
});

Then('the search box placeholder should not be visible', async ({ page }) => {
  await expect(cqlPlaceholder(page)).toBeHidden();
});

Then('a {string} filter chip should be shown', async ({ page }, key: string) => {
  const chip = cqlInput(page)
    .locator('chip-wrapper')
    .filter({ has: page.locator('chip-key', { hasText: key }) });
  await expect(chip).toBeVisible();
});

Then('the {string} checkbox should be ticked', async ({ page }, name: string) => {
  await expect(searchRegion(page).getByRole('checkbox', { name })).toBeChecked();
});

Then('the {string} checkbox should not be shown', async ({ page }, name: string) => {
  // Wait for the search box first so "not shown" isn't just "not rendered yet".
  await expect(searchRegion(page).locator('gr-structured-query')).toBeVisible();
  await expect(searchRegion(page).getByRole('checkbox', { name })).toHaveCount(0);
});
