import { Given, KAHUNA_APP_URL, expect } from './setup.ts';
import { OIDC_ISSUER, TEST_ACCOUNTS } from '../setup/constants.ts';
import type { TestAccount } from '../setup/constants.ts';
import type { Page } from '@playwright/test';

export async function authenticate(page: Page, loginAccount: TestAccount): Promise<void> {
  const providerOrigin = OIDC_ISSUER;

  await expect(page).toHaveURL((url) => url.origin === providerOrigin);
  await page.locator('input[name="login"]').fill(loginAccount);
  await page.locator('input[name="password"]').fill('e2e-password');
  await page.locator('form').getByRole('button').click();

  if (new URL(page.url()).origin === providerOrigin) {
    await page.locator('input[name="prompt"][value="consent"]').locator('..').getByRole('button').click();
  }

  await expect(page).toHaveURL((url) => url.origin === KAHUNA_APP_URL);
}

Given('the application stack is running', async ({ request }) => {
  const response = await request.get('/management/healthcheck');
  expect(response.ok()).toBeTruthy();
});

/** Sign in as `account` and land on the upload page, arriving from search. */
export async function openUploadPage(page: Page, account: TestAccount): Promise<void> {
  // Accept the default of blurring graphic images up front. Kahuna otherwise shows a
  // first-run explainer overlay that covers the top bar (see services/graphic-image-blur.js).
  await page.context().addCookies([
    {
      name: 'SHOULD_BLUR_GRAPHIC_IMAGES',
      value: 'true',
      domain: `.${new URL(KAHUNA_APP_URL).hostname}`,
      path: '/',
    },
  ]);

  // Arrive from search rather than deep-linking, so the upload page has a same-document
  // history entry behind it and back-navigation behaves as it does for a real user.
  await page.goto(KAHUNA_APP_URL);
  await authenticate(page, account);
  await page.getByRole('banner').getByRole('link', { name: 'My recent uploads' }).click();
  await page.waitForURL('**/upload');
}

Given('I have opened the image upload page', async ({ page, testContext }) => {
  // An unhandled dialog blocks the page, so record every one and answer it. Dismissing a
  // confirm answers "no", which keeps us on the page under test.
  page.on('dialog', (dialog) => {
    testContext.dialogs.push(dialog.message());
    void dialog.dismiss();
  });

  await openUploadPage(page, TEST_ACCOUNTS.fullAccess);
});
