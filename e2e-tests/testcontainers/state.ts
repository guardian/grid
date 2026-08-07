/**
 * Shared, process-scoped registry for the Testcontainers instances started by
 * `global-setup.ts`. Playwright runs global setup and global teardown in the same
 * Node process, so a module-level singleton is a reliable way to hand references
 * from setup to teardown.
 */
import type { StartedTestContainer } from 'testcontainers';
import type { StartedNetwork } from 'testcontainers';
import type { ChildProcess } from 'child_process';

export interface GridEnvironment {
  network: StartedNetwork;
  /** Every started container, in start order. Stopped in reverse on teardown. */
  containers: StartedTestContainer[];
  /** The host `sbt <svc>/run` process running all Grid services (its own process group). */
  appProcess: ChildProcess;
  /** The host Caddy reverse-proxy process (its own process group). */
  caddyProcess: ChildProcess;
  /** Absolute paths of the generated config files (in `~/.grid`), removed on teardown. */
  configFiles: string[];
  /** Base URL of the Kahuna UI, e.g. http://localhost:9005 */
  baseUrl: string;
}

let environment: GridEnvironment | undefined;

export function setEnvironment(env: GridEnvironment): void {
  environment = env;
}

export function getEnvironment(): GridEnvironment | undefined {
  return environment;
}
