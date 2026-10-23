import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { KAHUNA_APP_URL } from '../setup.ts';
import { OIDC_ISSUER } from '../../setup/constants.ts';
import type { TestAccount } from '../../setup/constants.ts';

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

/** Sign in as `account`, landing on the search page. */
export async function signIn(page: Page, account: TestAccount): Promise<void> {
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

  await page.goto(KAHUNA_APP_URL);
  await authenticate(page, account);
}

/** Clearing cookies drops both the Panda and OIDC sessions, so we sign in afresh. */
export async function switchAccount(page: Page, account: TestAccount): Promise<void> {
  await page.context().clearCookies();
  await signIn(page, account);
}
