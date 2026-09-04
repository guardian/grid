/**
 * Playwright global teardown. Stops the stack started in `global-setup.ts`.
 */
import { stopStack } from './stack.ts';
import { getEnvironment } from './state.ts';

async function globalTeardown(): Promise<void> {
  await stopStack(getEnvironment());
}

export default globalTeardown;
