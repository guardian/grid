/**
 * Playwright global setup. Attaches to a running Grid stack if there is one, otherwise
 * boots a fresh one (see `setup/stack.ts`), stashing it for `global-teardown.ts`
 * and exposing the Kahuna base URL via `GRID_BASE_URL`.
 */
import { rm } from 'node:fs/promises';
import { ensureStack } from './stack.ts';
import { setEnvironment } from './state.ts';
import coverageOptions from './mcr.config.ts';

async function globalSetup(): Promise<void> {
  captureDebugLog();
  if (process.env.GRID_DISABLE_COVERAGE !== 'true') {
    // Stale per-feature caches would otherwise leak into this run's per-feature and per-scenario reports.
    await rm(coverageOptions.outputDir, { recursive: true, force: true });
  }
  const environment = await ensureStack();
  stopContainerLogCapture();
  process.env.GRID_BASE_URL = environment.baseUrl;
  setEnvironment(environment);
}

export default globalSetup;
