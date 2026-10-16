/**
 * Signs in once per run and saves the session, which every browser scenario starts from
 * (see the `auth` project in playwright.config.ts).
 */
import { test as setup } from '@playwright/test';
import { AUTH_STATE_PATH, TEST_ACCOUNTS } from './constants.ts';
import { signIn } from '../steps/utils/auth.ts';

setup('sign in as the full-access account', async ({ page }) => {
  await signIn(page, TEST_ACCOUNTS.fullAccess);
  await page.context().storageState({ path: AUTH_STATE_PATH });
});
