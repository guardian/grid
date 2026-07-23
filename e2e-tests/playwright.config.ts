import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';
import { KAHUNA_PORT } from './testcontainers/constants';

/* Generate Playwright test files from the Gherkin feature files and step definitions.
   Run via `bddgen` (see package.json scripts) before `playwright test`. */
const testDir = defineBddConfig({
  features: './features/**/*.feature',
  steps: './steps/**/*.ts',
});

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir,
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Boot the Grid stack with Testcontainers before tests, and tear it down after. */
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL (Kahuna) to use in actions like `await page.goto('/')`. Set by global-setup. */
    baseURL: process.env.GRID_BASE_URL ?? `http://localhost:${KAHUNA_PORT}`,

    /* The Grid service domains are served over https by the developer's dev-nginx, which
       terminates TLS with a locally-generated (self-signed) certificate. Ignore cert
       validation so browser tests can load the https://*.media.<domain> origins. */
    ignoreHTTPSErrors: true,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
