import { expect } from '@playwright/test';
import type { APIResponse, Response } from '@playwright/test';
import { test as base, createBdd } from 'playwright-bdd';
import * as fs from 'fs';
import { DOMAIN, URLS_FILE } from '../testcontainers/constants';

interface GridUrls {
  /** Kahuna base URL on its fixed host port (for API-level `request` tests). */
  kahuna: string;
  /** media-api base URL on its fixed host port (for API-level `request` tests). */
  mediaApi: string;
}

/**
 * URL the browser loads the Kahuna SPA from. It is the real `https://media.<domain>`
 * origin, served by the developer's dev-nginx, which routes it (and the other
 * `https://*.media.<domain>` service domains the SPA follows via hypermedia links) to
 * the grid-all container's fixed ports (see global-setup.ts / dev/nginx-mappings.yml).
 * dev-nginx must be running with the media-service mappings for browser tests to work.
 */
export const KAHUNA_APP_URL = `https://media.${DOMAIN}`;

function readGridUrls(): GridUrls {
  return JSON.parse(fs.readFileSync(URLS_FILE, 'utf8')) as GridUrls;
}

/**
 * Mutable per-scenario state shared between steps (e.g. the response captured in a
 * `When` step and asserted on in a `Then` step).
 */
interface TestContext {
  response?: APIResponse;
  mediaApiResponse?: Promise<Response>;
}

/**
 * Test fixture that exposes the Grid service URLs resolved by `global-setup.ts` and
 * points `baseURL` at Kahuna's fixed host port for API-level `request` tests. Browser
 * steps should navigate to `KAHUNA_APP_URL` so the page origin is a real Grid domain
 * (required for the services' CORS origins to match) and dev-nginx does the routing.
 */
export const test = base.extend<{ gridUrls: GridUrls; testContext: TestContext }>({
  gridUrls: async ({}, use) => {
    await use(readGridUrls());
  },
  baseURL: async ({}, use) => {
    await use(readGridUrls().kahuna);
  },
  testContext: async ({}, use) => {
    await use({});
  },
});

export const { Given, When, Then, Before, After } = createBdd(test);
export { expect };
