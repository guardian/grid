/**
 * Shared, process-scoped registry for the Testcontainers instances started by
 * `global-setup.ts`. Playwright runs global setup and global teardown in the same
 * Node process, so a module-level singleton is a reliable way to hand references
 * from setup to teardown.
 *
 * Ownership is structural: this process only holds handles to resources it created,
 * so teardown stops what it holds and deletes what it wrote. When attaching to a
 * stack someone else started, these are empty and teardown is a no-op.
 */
import type { StartedTestContainer } from 'testcontainers';
import type { StartedNetwork } from 'testcontainers';

export interface GridEnvironment {
  /** Absent when attached to a stack this process did not start. */
  network?: StartedNetwork;
  /** Every container this process started, in start order. Stopped in reverse on teardown. */
  containers: StartedTestContainer[];
  /** Absolute path to the generated config directory mounted into the app container. */
  configDir?: string;
  /** Set only when this process wrote the URLs file, so teardown does not delete another stack's. */
  urlsFile?: string;
  /** Base URL of the Kahuna UI, e.g. http://localhost:9005 */
  baseUrl: string;
  /** Base URL of the media-api, e.g. http://localhost:9001 */
  mediaApiUrl: string;
}

let environment: GridEnvironment | undefined;

export function setEnvironment(env: GridEnvironment): void {
  environment = env;
}

export function getEnvironment(): GridEnvironment | undefined {
  return environment;
}
