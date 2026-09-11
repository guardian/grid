import { expect } from '@playwright/test';
import type { APIResponse, Response } from '@playwright/test';
import { test as base, createBdd } from 'playwright-bdd';
import { DOMAIN } from '../setup/constants.ts';

export const KAHUNA_APP_URL = `https://media.${DOMAIN}`;

/**
 * Mutable per-scenario state shared between steps (e.g. the response captured in a
 * `When` step and asserted on in a `Then` step).
 */
interface TestContext {
  response?: APIResponse;
  mediaApiResponse?: Promise<Response>;
}

/**
 * Browser steps should navigate to `KAHUNA_APP_URL` so the page origin is a real Grid
 * domain (required for the services' CORS origins to match). API-level `request` tests
 * use `baseURL` from the Playwright config, which points at Kahuna's fixed host port.
 */
export const test = base.extend<{ testContext: TestContext }>({
  testContext: async ({}, use) => {
    await use({});
  },
});

export const { Given, When, Then, Before, After } = createBdd(test);
export { expect };
