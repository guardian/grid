import { expect } from '@playwright/test';
import type { APIResponse, Dialog, FileChooser, Locator, Response } from '@playwright/test';
import { test as base, createBdd } from 'playwright-bdd';
import { DOMAIN } from '../setup/constants.ts';
import type { ImageSource } from '../setup/image-fixtures.ts';
import { deleteImageCopies, indexImageCopy } from '../setup/seed-image.ts';
import MCR from 'monocart-coverage-reports';
import coverageOptions from '../setup/mcr.config';
import type { ImageOverrides } from '../setup/seed-image.ts';
import type { SeedUsage, UsageStatus } from './image-usages/usages.ts';
import { addCoverage } from '../setup/mcr.config.ts';

export const KAHUNA_APP_URL = `https://media.${DOMAIN}`;

/**
 * Mutable per-scenario state shared between steps (e.g. the response captured in a
 * `When` step and asserted on in a `Then` step).
 */
export interface TestContext {
  response?: APIResponse;
  mediaApiResponse?: Promise<Response>;
  /** Messages from alerts and confirms, in the order the page raised them (see answerDialogs). */
  dialogs: string[];
  /** How answerDialogs answers the page's alerts and confirms. Dismisses when unset. */
  dialogAnswer?: 'accept' | 'dismiss';
  /** The disposable image copy that "the image" steps refer to. */
  imageId?: string;
  /** Requests that changed leases, as "METHOD /path" (see recordLeaseWrites). */
  leaseWrites?: string[];
  /** When a lease access type was chosen in the add lease form. */
  accessChosenAt?: Date;
  /** Whether answerDialogs leaves confirms unanswered (see holdingConfirms). */
  holdingConfirms?: boolean;
  /** A confirm left unanswered for a later step to answer. */
  heldConfirm?: Dialog;
  /** The action that raised `heldConfirm`, which finishes once it is answered. */
  heldAction?: Promise<unknown>;
  /** What `watchDuringWrites` showed while each lease write was in flight (see recordLeaseWrites). */
  shownDuringWrites?: string[];
  /** The element recordLeaseWrites reads during each lease write; the add lease control by default. */
  watchDuringWrites?: Locator;
  /** Ids of the images a scenario showed in search results or uploaded, in order. */
  surfaceImageIds?: string[];
  /** The metadata template a `Given` chose for a later step to select or apply. */
  metadataTemplate?: string;
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
  /** The seeded images selected for an edit-permission scenario, with their uploaders. */
  permissionImages?: { id: string; uploadedBy: string }[];
  /** The `q` of each search Kahuna ran since recording started (see recordSearches). */
  searchesRun?: string[];
  /** Rights editor property values a step filled in, keyed by property label. */
  rightsProperties?: Record<string, string>;
  /** Ids of the image copies `seedImage` indexed, deleted by the `After` hook. */
  seededImageIds: string[];
  /** The usages seeded on the image a scenario opened. */
  usages?: SeedUsage[];
  /** The id of the image copy the usages were seeded on. */
  usagesImageId?: string;
  /** The status of the group that "that usage group" steps refer to. */
  usageGroup?: UsageStatus;
  /** URLs of the DELETE requests Kahuna sent to remove an image's usages. */
  deleteUsagesRequests?: string[];
}

/** Index a disposable copy of `source`, with `overrides` applied, and return its id. */
export type SeedImage = (source: ImageSource, overrides?: ImageOverrides) => Promise<string>;

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
export const test = base.extend<{ testContext: TestContext; seedImage: SeedImage; coverage: void }>({
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
    await use(async (source, overrides) => {
      const id = await indexImageCopy(source, overrides);
      testContext.seededImageIds.push(id);
      return id;
    });
  },
  coverage: [async ({ page, browserName }, use, testInfo) => {
    if (process.env.GRID_ENABLE_COVERAGE !== 'true') {
      await use();
      return;
    }
    if (browserName !== 'chromium') {
      throw new Error('Native JS/CSS coverage requires Chromium');
    }

    // Start before beforeEach/test navigation executes application code.
    await Promise.all([
      page.coverage.startJSCoverage({
        resetOnNavigation: false
      }),
      page.coverage.startCSSCoverage({
        resetOnNavigation: false
      })
    ]);
    try {
      await use();
    } finally {
      // Persist data before Playwright closes the page, even if an assertion fails.
      const [js, css] = await Promise.all([
        page.coverage.stopJSCoverage(),
        page.coverage.stopCSSCoverage()
      ]);
      await addCoverage(testInfo.titlePath, [...js, ...css]);
    }
  }, {
    auto: true
  }]
});

export const { Given, When, Then, Before, After } = createBdd(test);
export { expect };

// Runs after failed scenarios too, so copies never outlive their scenario or its retries.
After(async ({ testContext }) => {
  await deleteImageCopies(testContext.seededImageIds);
});
