/**
 * Playwright global teardown. Stops the stack started in `global-setup.ts`.
 */
import { getEnvironment, setEnvironment, waitForSetup } from './state.ts';
import { readdir, readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import MCR from 'monocart-coverage-reports';
import coverageOptions, { FEATURE_COVERAGE_DIR, SCENARIOS_DIR_NAME, TITLE_FILE, reportOptions } from './mcr.config.ts';

async function subdirs(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries.filter((d) => d.isDirectory()).map((d) => d.name).sort();
}

async function generateReport(dir: string): Promise<void> {
  const title = await readFile(`${dir}/${TITLE_FILE}`, 'utf8').catch(() => basename(dir));
  await MCR(reportOptions(dir, title)).generate();
}

/** Writes a report for each feature and scenario from the caches the coverage fixture filled. */
async function generateFeatureReports(): Promise<void> {
  for (const feature of await subdirs(FEATURE_COVERAGE_DIR)) {
    const featureDir = `${FEATURE_COVERAGE_DIR}/${feature}`;
    await generateReport(featureDir);
    const scenariosDir = `${featureDir}/${SCENARIOS_DIR_NAME}`;

    for (const scenario of await subdirs(scenariosDir)) {
      await generateReport(`${scenariosDir}/${scenario}`);
    }
  }
}

async function globalTeardown(): Promise<void> {
  await waitForSetup();

  const environment = getEnvironment();

  if (!environment) return;

  setEnvironment(undefined);
  const { diagnostics } = environment;
  let failedStage: 'coverage' | 'cleanup' | undefined;

  try {
    if (process.env.GRID_DISABLE_COVERAGE !== 'true') {
      const results = await MCR(coverageOptions).generate();
      if (!results || !results.files.length) {
        throw new Error('No browser coverage generated: check fixtures and source scope');
      }
      await generateFeatureReports();
    }
  } catch (error) {
    diagnostics.error('coverage', error);
    failedStage = 'coverage';
  }

  try {
    await environment.stop();
  } catch (error) {
    diagnostics.error('cleanup:stack', error);
    failedStage ??= 'cleanup';
  } finally {
    diagnostics.flush();
  }

  if (failedStage) {
    throw new Error(`Grid e2e ${failedStage} failed. See ${diagnostics.directory}/stack.log`);
  }
}

export default globalTeardown;
