import type { StackDiagnostics } from './stack-diagnostics.ts';

export interface GridEnvironment {
  baseUrl: string;
  mediaApiUrl: string;
  configDir?: string;
  /** Stops the resources this run owns. A borrowed stack has nothing to stop. */
  stop(): Promise<void>;
}

// Playwright runs its global setup and teardown in the same process.
type Session = GridEnvironment & { diagnostics: StackDiagnostics };
let session: Session | undefined;
let pendingSetup: Promise<void> | undefined;

// After Ctrl-C, Playwright can begin teardown before setup has finished cleaning up.
export function trackSetup(work: Promise<void>): Promise<void> {
  pendingSetup = work;
  return work.finally(() => {
    if (pendingSetup === work) pendingSetup = undefined;
  });
}

export async function waitForSetup(): Promise<void> {
  // Global setup handles partial cleanup and reports its own failure to Playwright.
  await pendingSetup?.catch(() => {});
}

export function setEnvironment(environment: Session | undefined): void {
  session = environment;
}

export function getEnvironment(): Session | undefined {
  return session;
}
