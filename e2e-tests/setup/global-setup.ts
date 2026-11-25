/**
 * Playwright global setup. Attaches to a running Grid stack if there is one, otherwise
 * boots a fresh one (see `setup/stack.ts`), stashing it for `global-teardown.ts`
 * and exposing the Kahuna base URL via `GRID_BASE_URL`.
 */
import { rm } from 'node:fs/promises';
import { API_KEY, E2E_ROOT, OIDC_CLIENT_SECRET } from './constants.ts';
import { createStackDiagnostics } from './stack-diagnostics.ts';
import { ensureStack } from './stack.ts';
import { setEnvironment } from './state.ts';
import coverageOptions from './mcr.config.ts';

async function globalSetup(): Promise<void> {
  const diagnostics = createStackDiagnostics(E2E_ROOT);
  diagnostics.addSecrets([API_KEY, OIDC_CLIENT_SECRET]);
  try {
    if (process.env.GRID_ENABLE_COVERAGE === 'true') {
      // Stale per-feature caches would otherwise leak into this run's per-feature and per-scenario reports.
      await rm(coverageOptions.outputDir, { recursive: true, force: true });
    }
    const environment = await diagnostics.step('startup', () => ensureStack({ diagnostics }));
    process.env.GRID_BASE_URL = environment.baseUrl;
    setEnvironment(environment);
  } catch (error) {
    diagnostics.error('setup:stack', error);
    diagnostics.flush();
    throw new Error(`Grid e2e setup failed. See ${diagnostics.directory}/stack.log`);
  }
}

export default globalSetup;
