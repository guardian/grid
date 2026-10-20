import { Given, KAHUNA_APP_URL, expect } from './setup.ts';
import type { TestAccount } from '../setup/constants.ts';
import type { Page } from '@playwright/test';
import { switchAccount } from './utils/auth.ts';

Given('the application stack is running', async ({ request }) => {
  const response = await request.get('/management/healthcheck');
  expect(response.ok()).toBeTruthy();
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

/** Sign in afresh as `account` and land on the upload page. */
export async function openUploadPageAs(page: Page, account: TestAccount): Promise<void> {
  await switchAccount(page, account);
  await goToUploadPage(page);
}

Given('I have opened the image upload page', async ({ page, testContext }) => {
  // An unhandled dialog blocks the page, so record every one and answer it. Dismissing a
  // confirm answers "no", which keeps us on the page under test.
  page.on('dialog', (dialog) => {
    testContext.dialogs.push(dialog.message());
    void dialog.dismiss();
  });

  await openUploadPage(page);
});
