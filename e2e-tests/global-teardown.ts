/**
 * Playwright global teardown. Stops the containers started in `global-setup.ts`
 * (in reverse order), removes the shared network, and deletes the generated config.
 */
import * as fs from 'fs';
import { URLS_FILE } from './testcontainers/constants';
import { getEnvironment } from './testcontainers/state';

async function globalTeardown(): Promise<void> {
  const environment = getEnvironment();
  if (!environment) {
    return;
  }

  const { containers, network, configDir } = environment;

  for (const container of [...containers].reverse()) {
    try {
      await container.stop();
    } catch (error) {
      // Best effort: keep tearing down the rest of the stack.
      console.warn(`Failed to stop container: ${(error as Error).message}`);
    }
  }

  try {
    await network.stop();
  } catch (error) {
    console.warn(`Failed to stop network: ${(error as Error).message}`);
  }

  try {
    fs.rmSync(configDir, { recursive: true, force: true });
  } catch (error) {
    console.warn(`Failed to remove config dir: ${(error as Error).message}`);
  }

  try {
    fs.rmSync(URLS_FILE, { force: true });
  } catch (error) {
    console.warn(`Failed to remove urls file: ${(error as Error).message}`);
  }
}

export default globalTeardown;
