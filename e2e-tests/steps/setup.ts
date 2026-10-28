import { expect } from '@playwright/test';
import type { APIResponse, FileChooser, Locator, Response } from '@playwright/test';
import { test as base, createBdd } from 'playwright-bdd';
import { DOMAIN } from '../setup/constants.ts';
import type { ImageSource } from '../setup/image-fixtures.ts';
import { deleteImageCopies, indexImageCopy } from '../setup/seed-image.ts';

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
  /** The delete control a `Given` set up, for a later `When` to act on. */
  deleteButton?: Locator;
  /** A field value edited before applying a metadata template, to assert its restoration. */
  editedByline?: string;
  /** Embedded metadata values expected to appear in the editor, keyed by field name. */
  expectedMetadata?: Record<string, string>;
  /** Field values batch-applied across current uploads, keyed by the feature-table label. */
  batchApplied?: Record<string, string>;
  /** Labels added in the upload prompt to apply to every upload. */
  presetLabels?: string[];
  /** Lets a held past-uploads search through (see holdPastUploads). */
  releasePastUploads?: () => void;
  /** The page region a `Then` found, for later steps to assert on its contents. */
  region?: Locator;
  /** The usage rights category code a `Given` chose the opened image by. */
  usageRightsCategory?: string;
  /** The seeded image selected for an edit-permission scenario. */
  permissionImage?: { id: string; uploadedBy: string };
  /** The `q` of each search Kahuna ran since recording started (see recordSearches). */
  searchesRun?: string[];
  /** Ids of the image copies `seedImage` indexed, deleted by the `After` hook. */
  seededImageIds: string[];
}

/** Index a disposable copy of a seeded image, with `overrides` applied, and return its id. */
type SeedImage = (overrides?: Partial<ImageSource>) => Promise<string>;

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
export const test = base.extend<{ testContext: TestContext; seedImage: SeedImage }>({
  page: async ({ page }, use) => {
    await use(page);
    if (page.video() && !page.isClosed()) {
      await page.waitForTimeout(1_500);
    }
  },
  testContext: async ({ }, use) => {
    await use({ dialogs: [], seededImageIds: [] });
  },
  seedImage: async ({ testContext }, use) => {
    await use(async (overrides) => {
      const id = await indexImageCopy(overrides);
      testContext.seededImageIds.push(id);
      return id;
    });
  },
});

export const { Given, When, Then, Before, After } = createBdd(test);
export { expect };

// Runs after failed scenarios too, so copies never outlive their scenario or its retries.
After(async ({ testContext }) => {
  await deleteImageCopies(testContext.seededImageIds);
});
