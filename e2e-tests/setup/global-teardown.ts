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

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

async function subdirs(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries.filter((d) => d.isDirectory()).map((d) => d.name).sort();
}

async function reportRow(dir: string, href: string, cssClass: string): Promise<string | undefined> {
  const title = await readFile(`${dir}/${TITLE_FILE}`, 'utf8').catch(() => basename(dir));
  const results = await MCR(reportOptions(dir, title)).generate();
  if (!results) return undefined;
  const pct = (m: keyof CoverageSummary) => `${results.summary[m]?.pct ?? ''}%`;
  return `<tr class="${cssClass}"><td><a href="${href}/index.html">${escapeHtml(title)}</a></td>` +
    `<td>${pct('lines')}</td><td>${pct('functions')}</td><td>${pct('branches')}</td></tr>`;
}

async function generateBreakdownReports(): Promise<void> {
  const rows: (string | undefined)[] = [];
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
  await writeFile(`${FEATURE_COVERAGE_DIR}/index.html`, `<!doctype html><meta charset="utf-8">
<title>Coverage by feature and scenario</title>
<style>body{font-family:sans-serif}td,th{padding:4px 12px;text-align:left}
tr.feature td{font-weight:bold;padding-top:12px}tr.scenario td:first-child{padding-left:32px}</style>
<h1>Coverage by feature and scenario</h1><p><a href="../index.html">All features combined</a></p>
<table><tr><th>Feature / Scenario</th><th>Lines</th><th>Functions</th><th>Branches</th></tr>
${rows.filter(Boolean).join('\n')}</table>\n`);
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
