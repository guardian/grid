import { Before, Given, KAHUNA_APP_URL, Then, expect } from './setup.ts';
import { TEST_ACCOUNTS } from '../setup/constants.ts';
import type { TestAccount } from '../setup/constants.ts';
import type { Page } from '@playwright/test';
import { switchAccount } from './utils/auth.ts';
import { answerDialogs, expectDialog } from './utils/dialogs.ts';

// Before any page loads, so steps can pause the clock and run on Kahuna's timers (see pauseClock)
// instead of waiting for them. Time passes as normal until a step pauses it.
Before({ tags: '@fake-clock' }, async ({ page }) => {
  await page.clock.install();
});

Given('the application stack is running', async ({ request }) => {
  const response = await request.get('/management/healthcheck');
  expect(response.ok()).toBeTruthy();
});

// The `auth` setup project signs in through Panda and OIDC once per run (setup/auth.setup.ts),
// so here we only confirm the saved session holds the Panda cookie and is still accepted.
Given('I am signed in through pan-domain auth', async ({ page }) => {
  const cookies = await page.context().cookies();
  expect(cookies.map((cookie) => cookie.name)).toContain('gutoolsAuth-assym');

  await page.goto(KAHUNA_APP_URL);
  // A missing or expired session would have redirected us to the OIDC provider.
  await expect(page).toHaveURL((url) => url.origin === KAHUNA_APP_URL);
});

Given('I am signed in without edit metadata permission', async ({ page }) => {
  await switchAccount(page, TEST_ACCOUNTS.restricted);
});

Given('I am signed in with edit metadata permission', async ({ page }) => {
  await switchAccount(page, TEST_ACCOUNTS.fullAccess);
});

Then('I see a(n) {string} button', async ({ page }, name: string) => {
  await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
});

Then('I do not see a(n) {string} button', async ({ page }, name: string) => {
  await expect(page.getByRole('button', { name, exact: true })).toBeHidden();
});

// Only sees dialogs on a page an earlier step called answerDialogs on.
Then('I am alerted/asked {string}', async ({ testContext }, message: string) => {
  await expectDialog(testContext, message);
});

/** From the search page, go to the upload page. */
async function goToUploadPage(page: Page): Promise<void> {
  // Arrive from search rather than deep-linking, so the upload page has a same-document
  // history entry behind it and back-navigation behaves as it does for a real user.
  await page.getByRole('banner').getByRole('link', { name: 'My recent uploads' }).click();
  await page.waitForURL('**/upload');
}

/** Open the upload page with the session saved by setup/auth.setup.ts. */
export async function openUploadPage(page: Page): Promise<void> {
  await page.goto(KAHUNA_APP_URL);
  // A missing or expired saved session would have redirected us to the OIDC provider.
  await expect(page).toHaveURL((url) => url.origin === KAHUNA_APP_URL);
  await goToUploadPage(page);
}

/** Sign in afresh as `account` and land on the upload page, arriving from search. */
export async function openUploadPageAs(page: Page, account: TestAccount): Promise<void> {
  await switchAccount(page, account);
  await openUploadPage(page);
}

Given('I have opened the image upload page', async ({ page, testContext }) => {
  answerDialogs(page, testContext);
  await openUploadPage(page);
});
