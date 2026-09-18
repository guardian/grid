import { expect } from '@playwright/test';
import type { APIResponse, FileChooser, Response } from '@playwright/test';
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
  /** Messages from alerts and confirms, in the order the page raised them. */
  dialogs: string[];
  fileChooser?: Promise<FileChooser>;
  /** The query run on the search page before navigating to the upload page. */
  previousSearchQuery?: string;
  /** Path of the image uploaded earlier in a scenario, to re-upload the same bytes. */
  uploadedImagePath?: string;
  /** A field value edited before applying a metadata template, to assert its restoration. */
  editedByline?: string;
  /** Embedded metadata values expected to appear in the editor, keyed by field name. */
  expectedMetadata?: Record<string, string>;
}

export interface TestImage {
  fileName: string;
  path: string;
  bytes: number;
}

/**
 * Browser steps should navigate to `KAHUNA_APP_URL` so the page origin is a real Grid
 * domain (required for the services' CORS origins to match). API-level `request` tests
 * use `baseURL` from the Playwright config, which points at Kahuna's fixed host port.
 */
export const test = base.extend<{ testContext: TestContext }>({
  testContext: async ({}, use) => {
    await use({ dialogs: [] });
  },
});

export const { Given, When, Then, Before, After } = createBdd(test);
export { expect };

