/**
 * Playwright global teardown. Stops the stack started in `global-setup.ts`.
 */
import { stopStack } from './stack.ts';
import { getEnvironment } from './state.ts';
import MCR from 'monocart-coverage-reports';
import coverageOptions from './mcr.config';

async function globalTeardown(): Promise<void> {
  const results = await MCR(coverageOptions).generate();
  if (!results || !results.files.length) {
    throw new Error('No browser coverage generated: check fixtures and source scope');
  }
  await stopStack(getEnvironment());
}

export default globalTeardown;
