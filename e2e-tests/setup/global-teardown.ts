/**
 * Playwright global teardown. Stops the stack started in `global-setup.ts`.
 */
import { stopStack } from './stack.ts';
import { getEnvironment } from './state.ts';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import MCR from 'monocart-coverage-reports';
import type { CoverageSummary } from 'monocart-coverage-reports';
import coverageOptions, { FEATURE_COVERAGE_DIR, SCENARIOS_DIR_NAME, TITLE_FILE, reportOptions } from './mcr.config.ts';
import { renderCoverageIndex } from './coverage-index.tsx';
import type { CoverageRow } from './coverage-index.tsx';

async function subdirs(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries.filter((d) => d.isDirectory()).map((d) => d.name).sort();
}

async function reportRow(dir: string, href: string, kind: CoverageRow['kind']): Promise<CoverageRow | undefined> {
  const title = await readFile(`${dir}/${TITLE_FILE}`, 'utf8').catch(() => basename(dir));
  const results = await MCR(reportOptions(dir, title)).generate();
  if (!results) return undefined;
  const pct = (m: keyof CoverageSummary) => `${results.summary[m]?.pct ?? ''}%`;
  return { kind, title, href, lines: pct('lines'), functions: pct('functions'), branches: pct('branches') };
}

async function generateBreakdownReports(): Promise<void> {
  const rows: (CoverageRow | undefined)[] = [];
  for (const feature of await subdirs(FEATURE_COVERAGE_DIR)) {
    const featureDir = `${FEATURE_COVERAGE_DIR}/${feature}`;
    const featureHref = encodeURIComponent(feature);
    rows.push(await reportRow(featureDir, featureHref, 'feature'));
    const scenariosDir = `${featureDir}/${SCENARIOS_DIR_NAME}`;
    for (const scenario of await subdirs(scenariosDir)) {
      rows.push(await reportRow(`${scenariosDir}/${scenario}`,
        `${featureHref}/${SCENARIOS_DIR_NAME}/${encodeURIComponent(scenario)}`, 'scenario'));
    }
  }
  await writeFile(`${FEATURE_COVERAGE_DIR}/index.html`, renderCoverageIndex(rows.filter((row) => row !== undefined)));
}

async function globalTeardown(): Promise<void> {
  if (process.env.GRID_DISABLE_COVERAGE !== 'true') {
    const results = await MCR(coverageOptions).generate();
    if (!results || !results.files.length) {
      throw new Error('No browser coverage generated: check fixtures and source scope');
    }
    await generateBreakdownReports();
  }
  await stopStack(getEnvironment());
}

export default globalTeardown;
