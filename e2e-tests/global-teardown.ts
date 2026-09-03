/**
 * Playwright global teardown. Stops the stack started in `global-setup.ts`.
 */
import { stopStack } from './testcontainers/stack.ts';
import { getEnvironment } from './testcontainers/state.ts';

async function globalTeardown(): Promise<void> {
  await stopStack(getEnvironment());
}

export default globalTeardown;
