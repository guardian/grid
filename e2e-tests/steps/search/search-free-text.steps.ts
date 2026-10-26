import { Given, Then, When, KAHUNA_APP_URL, expect } from '../setup.ts';
import { setTestClientConfig } from '../utils/test-config.ts';
import {
  DEFAULT_SEARCH_INPUT,
  chipsTextInput,
  cqlInput,
  cqlPlaceholder,
  expectSearchBoxEmpty,
  isSearchRun,
  recordSearches,
  searchBoxReady,
  searchRegion,
  setCqlFeatureSwitch,
} from './search-box.ts';

function onOff(value: string): boolean {
  if (value !== 'on' && value !== 'off') {
    throw new Error(`Expected "on" or "off", got "${value}"`);
  }
  return value === 'on';
}

function enabledDisabled(value: string): boolean {
  if (value !== 'enabled' && value !== 'disabled') {
    throw new Error(`Expected "enabled" or "disabled", got "${value}"`);
  }
  return value === 'enabled';
}

Given('I have opened the image search page', async ({ page, testContext }) => {
  await page.goto(`${KAHUNA_APP_URL}/search`);
  await searchBoxReady(page, testContext.searchInput ?? DEFAULT_SEARCH_INPUT);
});

Given('the CQL search input feature switch is {word}', async ({ page, testContext }, state: string) => {
  const on = onOff(state);
  await setCqlFeatureSwitch(page, on);
  testContext.searchInput = on ? 'cql' : 'chips';
  // The switch is read when the page loads, so reload to pick up the cookie.
  await page.reload();
  await searchBoxReady(page, testContext.searchInput);
});

Given('AI search is {word}', async ({ page, testContext }, state: string) => {
  // Overrides `aiSearchEnabled` in window._clientConfig (kahuna/app/views/main.scala.html) and reloads.
  await setTestClientConfig(page, { aiSearchEnabled: enabledDisabled(state) });
  await searchBoxReady(page, testContext.searchInput ?? DEFAULT_SEARCH_INPUT);
});

Given('the search box is empty', async ({ page, testContext }) => {
  await expectSearchBoxEmpty(page, testContext.searchInput ?? DEFAULT_SEARCH_INPUT);
});

Given('the {string} checkbox is ticked', async ({ page }, name: string) => {
  const checkbox = searchRegion(page).getByRole('checkbox', { name });
  await checkbox.check();
  await expect(checkbox).toBeChecked();
});

When('I type {string} into the search box', async ({ page, testContext }, text: string) => {
  recordSearches(page, testContext);
  if ((testContext.searchInput ?? DEFAULT_SEARCH_INPUT) === 'cql') {
    await cqlInput(page).locator('.Cql__ContentEditable').pressSequentially(text);
  } else {
    await chipsTextInput(page).pressSequentially(text);
  }
});

When('I tick the {string} checkbox', async ({ page }, name: string) => {
  await searchRegion(page).getByRole('checkbox', { name }).check();
});

When('I untick the {string} checkbox', async ({ page }, name: string) => {
  await searchRegion(page).getByRole('checkbox', { name }).uncheck();
});

When('I open a search link with the query {string}', async ({ page, testContext }, query: string) => {
  // Wait for the link's own search so later steps don't mistake it for a new one.
  const searched = page.waitForRequest(isSearchRun);
  await page.goto(`${KAHUNA_APP_URL}/search?query=${encodeURIComponent(query)}`);
  await searched;
  await searchBoxReady(page, testContext.searchInput ?? DEFAULT_SEARCH_INPUT);
});

When('I open a search link with AI search turned on', async ({ page, testContext }) => {
  await page.goto(`${KAHUNA_APP_URL}/search?useAISearch=true`);
  await searchBoxReady(page, testContext.searchInput ?? DEFAULT_SEARCH_INPUT);
});

Then('the search box placeholder should read {string}', async ({ page, testContext }, text: string) => {
  if ((testContext.searchInput ?? DEFAULT_SEARCH_INPUT) === 'cql') {
    await expect(cqlPlaceholder(page)).toBeVisible();
    await expect(cqlPlaceholder(page)).toHaveText(text);
  } else {
    // :placeholder-shown only matches while the browser is actually displaying the hint.
    const shown = searchRegion(page).locator('[data-cy="image-search-input"]:placeholder-shown');
    await expect(shown).toBeVisible();
    await expect(shown).toHaveAttribute('placeholder', text);
  }
});

Then('the search box placeholder should not be visible', async ({ page, testContext }) => {
  if ((testContext.searchInput ?? DEFAULT_SEARCH_INPUT) === 'cql') {
    await expect(cqlPlaceholder(page)).toBeHidden();
  } else {
    await expect(chipsTextInput(page)).toBeVisible();
    await expect(searchRegion(page).locator('[data-cy="image-search-input"]:placeholder-shown')).toHaveCount(0);
  }
});

Then('a {string} filter chip should be shown', async ({ page, testContext }, key: string) => {
  const chip = (testContext.searchInput ?? DEFAULT_SEARCH_INPUT) === 'cql'
    ? cqlInput(page)
      .locator('chip-wrapper')
      .filter({ has: page.locator('chip-key', { hasText: key }) })
    : searchRegion(page)
      .locator('gr-filter-chip')
      .filter({ has: page.locator('.gr-filter-chip__key', { hasText: `${key}:` }) });
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
