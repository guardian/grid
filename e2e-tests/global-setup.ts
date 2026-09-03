/**
 * Playwright global setup. Boots the Grid stack (see `testcontainers/stack.ts`) and
 * stashes it for `global-teardown.ts`, exposing the Kahuna base URL via `GRID_BASE_URL`.
 */
import { startStack } from './testcontainers/stack.ts';
import { setEnvironment } from './testcontainers/state.ts';

async function globalSetup(): Promise<void> {
  const environment = await startStack();
  process.env.GRID_BASE_URL = environment.baseUrl;
  setEnvironment(environment);
}

export default globalSetup;
