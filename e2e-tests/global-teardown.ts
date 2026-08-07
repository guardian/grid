/**
 * Playwright global teardown. Stops the host processes (Grid services + Caddy) and the
 * containers started in `global-setup.ts` (in reverse order), removes the shared network,
 * and deletes the generated config.
 */
import * as fs from 'fs';
import type { ChildProcess } from 'child_process';
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

/** Signal a detached child's whole process group, ignoring "already gone" errors. */
function killProcessGroup(child: ChildProcess): void {
  if (child.pid === undefined) {
    return;
  }
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    // Process group already gone.
  }
}

async function globalTeardown(): Promise<void> {
  const environment = getEnvironment();
  if (!environment) {
    return;
  }

  const { containers, network, appProcess, caddyProcess, configFiles } = environment;

  await warnOnException('Failed to stop Caddy', () => killProcessGroup(caddyProcess));
  await warnOnException('Failed to stop Grid services', () => killProcessGroup(appProcess));

  for (const container of [...containers].reverse()) {
    await warnOnException('Failed to stop container', () => container.stop());
  }

  await warnOnException('Failed to stop network', () => network.stop());
  for (const file of configFiles) {
    await warnOnException('Failed to remove config file', () => fs.rmSync(file, { force: true }));
  }
  await warnOnException('Failed to remove urls file', () => fs.rmSync(URLS_FILE, { force: true }));
}

export default globalTeardown;
