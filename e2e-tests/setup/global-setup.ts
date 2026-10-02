/**
 * Playwright global setup. Attaches to a running Grid stack if there is one, otherwise
 * boots a fresh one (see `setup/stack.ts`), stashing it for `global-teardown.ts`
 * and exposing the Kahuna base URL via `GRID_BASE_URL`.
 */
import { ensureStack } from './stack.ts';
import { setEnvironment } from './state.ts';

async function globalSetup(): Promise<void> {
  const environment = await ensureStack();
  process.env.GRID_BASE_URL = environment.baseUrl;
  setEnvironment(environment);
}

export default globalSetup;
