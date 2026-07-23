/**
 * Playwright global teardown. Stops the containers started in `global-setup.ts`
 * (in reverse order), removes the shared network, and deletes the generated config.
 */
import * as fs from 'fs';
import { URLS_FILE } from './testcontainers/constants';
import { getEnvironment } from './testcontainers/state';

/** Run a best-effort teardown step, warning (not throwing) so the rest still runs. */
async function warnOnException(label: string, fn: () => unknown): Promise<void> {
  try {
    await fn();
  } catch (error) {
    console.warn(`${label}: ${(error as Error).message}`);
  }
}

async function globalTeardown(): Promise<void> {
  const environment = getEnvironment();
  if (!environment) {
    return;
  }

  const { containers, network, configDir } = environment;

  for (const container of [...containers].reverse()) {
    await warnOnException('Failed to stop container', () => container.stop());
  }

  await warnOnException('Failed to stop network', () => network.stop());
  await warnOnException('Failed to remove config dir', () =>
    fs.rmSync(configDir, { recursive: true, force: true }),
  );
  await warnOnException('Failed to remove urls file', () => fs.rmSync(URLS_FILE, { force: true }));
}

export default globalTeardown;
