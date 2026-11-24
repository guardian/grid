import { rm } from 'node:fs/promises';
import { API_KEY, E2E_ROOT, OIDC_CLIENT_SECRET } from './constants.ts';
import coverageOptions from './mcr.config.ts';
import { ensureStack } from './shared-stack.ts';
import { createStackDiagnostics } from './stack-diagnostics.ts';
import { setEnvironment, trackSetup } from './state.ts';

async function prepareEnvironment(): Promise<void> {
  const diagnostics = createStackDiagnostics(E2E_ROOT);
  diagnostics.addSecrets([API_KEY, OIDC_CLIENT_SECRET]);

  const startup = new AbortController();
  const interrupt = (signal: NodeJS.Signals) => startup.abort(new Error(`Grid startup interrupted by ${signal}`));

  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);

  try {
    if (process.env.GRID_DISABLE_COVERAGE !== 'true') {
      // Only global setup may clear the caches shared by coverage workers.
      await rm(coverageOptions.outputDir, { recursive: true, force: true });
    }

    const environment = await ensureStack(diagnostics, {}, startup.signal);
    setEnvironment({ ...environment, diagnostics });
    process.env.GRID_BASE_URL = environment.baseUrl;
  } catch (error) {
    diagnostics.error('setup:stack', error);
    diagnostics.flush();

    throw new Error(`Grid e2e setup failed. See ${diagnostics.directory}/stack.log`);
  } finally {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
  }
}

export default function globalSetup(): Promise<void> {
  return trackSetup(prepareEnvironment());
}
