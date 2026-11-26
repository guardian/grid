/**
 * Boots the Grid stack outside Playwright and holds it open until Ctrl-C.
 *
 * Chekov serves the https://*.media.<domain> domains by default.
 * Set `GRID_PROXY=false` to use an external dev-nginx instead.
 */
import {
  API_KEY, E2E_ROOT, ELASTICSEARCH_URL, LOCALSTACK_URL, OIDC_CLIENT_SECRET, OIDC_ISSUER, SERVICE_CONFIGS,
} from './constants.ts';
import { probeStack, unavailableStackError } from './shared-stack.ts';
import { startStack } from './stack-containers.ts';
import { createStackDiagnostics } from './stack-diagnostics.ts';
import type { GridEnvironment } from './state.ts';

async function dev(): Promise<void> {
  const diagnostics = createStackDiagnostics(E2E_ROOT);
  diagnostics.addSecrets([API_KEY, OIDC_CLIENT_SECRET]);
  const shutdown = new AbortController();
  const stopped = Promise.withResolvers<void>();
  let environment: GridEnvironment | undefined;
  let keepAlive: NodeJS.Timeout | undefined;

  const interrupt = (signal: NodeJS.Signals): void => {
    const exitCode = signal === 'SIGINT' ? 130 : 143;
    if (shutdown.signal.aborted) process.exit(exitCode);
    if (!environment) process.exitCode = exitCode;
    diagnostics.log(`Received ${signal}, stopping Grid`);
    shutdown.abort(new Error(`Grid interrupted by ${signal}`));
    stopped.resolve();
  };

  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);

  try {
    const probe = await probeStack(shutdown.signal);

    if (probe.state === 'unavailable') throw unavailableStackError(probe.ports);
    if (probe.state === 'healthy') {
      throw new Error('Grid is already running. Stop that stack before starting another.');
    }


    environment = await startStack({}, diagnostics, shutdown.signal);

    for (const [name, { port }] of Object.entries(SERVICE_CONFIGS)) {
      diagnostics.log(`${name.padEnd(24)} http://localhost:${port}`);
    }

    diagnostics.log(`${'localstack'.padEnd(24)} ${LOCALSTACK_URL}`);
    diagnostics.log(`${'elasticsearch'.padEnd(24)} ${ELASTICSEARCH_URL}`);
    diagnostics.log(`${'oidc-provider'.padEnd(24)} ${OIDC_ISSUER}`);
    diagnostics.log(`Config at ${environment.configDir}\nPress Ctrl-C to stop Grid.`);
    keepAlive = setInterval(() => { }, 2_000_000_000);
    await stopped.promise;
  } catch (error) {
    if (error !== shutdown.signal.reason) {
      diagnostics.error('setup:stack', error);
      process.exitCode = 1;
    }
  } finally {
    clearInterval(keepAlive);
    try {
      await environment?.stop();
    } finally {
      process.off('SIGINT', interrupt);
      process.off('SIGTERM', interrupt);
      diagnostics.flush();
    }
  }
}

await dev();
