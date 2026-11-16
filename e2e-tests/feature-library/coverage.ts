/** Scrapes per-feature function coverage out of the monocart v8 HTML reports written by the e2e tests. */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { inflateSync } from 'lz-utils';
import type { CoverageManifest, CoverageSummary, SourceCoverage } from './types.ts';

/** The subset of a monocart v8 report file entry needed to identify covered functions and lines. */
interface ReportFile {
  sourcePath: string;
  source?: string;
  data?: {
    functions?: { name: string; start: number; count: number }[];
    /** One-based line → hit count, or "covered/total" branches for partly run lines. */
    lines?: Record<string, number | string>;
  };
}

/** @returns One character per source line: '+' run, '~' partly run, '-' not run, '.' not executable. */
function lineStates(file: ReportFile): string {
  const total = (file.source ?? '').split('\n').length;
  const lines = file.data?.lines ?? {};
  const states: string[] = [];
  for (let line = 1; line <= total; line++) {
    const hits = lines[line];
    states.push(hits === undefined ? '.' : typeof hits === 'string' ? (hits.startsWith('0/') ? '-' : '~') : hits > 0 ? '+' : '-');
  }
  return states.join('');
}

/** @returns A lookup from character offset to one-based line number in `source`. */
function lineIndex(source = ''): (offset: number) => number {
  const starts = [0];
  for (let i = source.indexOf('\n'); i !== -1; i = source.indexOf('\n', i + 1)) starts.push(i + 1);
  return (offset) => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (starts[middle] <= offset) low = middle;
      else high = middle - 1;
    }
    return low + 1;
  };
}

async function subdirectories(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

/** @returns The decoded monocart report data, or null when the directory has no generated report. */
async function decodeReport(dir: string): Promise<{ files: ReportFile[]; summary: Record<string, { pct: number | '' }> } | null> {
  const script = await readFile(path.join(dir, 'coverage-data.js'), 'utf8').catch(() => null);
  if (!script) return null;
  const encoded = /^window\.reportData = '(.*)';\s*$/s.exec(script)?.[1];
  const json = encoded ? inflateSync(encoded) : undefined;
  if (!json) throw new Error(`Unreadable coverage report in ${dir}`);
  return JSON.parse(json);
}

/** @returns The report's title and files, or null when the directory has no generated report. */
async function readReport(dir: string): Promise<{ title: string; files: ReportFile[] } | null> {
  const report = await decodeReport(dir);
  if (!report) return null;
  const title = (await readFile(path.join(dir, 'title.txt'), 'utf8').catch(() => path.basename(dir))).trim();
  return { title, files: report.files };
}

/** @returns Line, function and branch percentages from the combined report in `reportDir`, or null if absent. */
export async function loadCoverageSummary(reportDir: string): Promise<CoverageSummary | null> {
  const report = await decodeReport(reportDir);
  if (!report) return null;
  const pct = (metric: string) => Number(report.summary[metric]?.pct) || 0;
  return { lines: pct('lines'), functions: pct('functions'), branches: pct('branches') };
}

/**
 * @param featuresDir - `coverage-reports/features`, with one report directory per feature
 * and a `scenarios/` directory of per-scenario reports inside each.
 * @returns Feature and scenario → covered function links plus per-line source coverage, or null when
 * no coverage has been generated. Features and scenarios without a browser report (e.g. API-only ones) are omitted.
 */
export async function loadCoverage(featuresDir: string): Promise<{ coverage: CoverageManifest; sources: SourceCoverage } | null> {
  const entries = await readdir(featuresDir, { withFileTypes: true }).catch(() => null);
  if (!entries) return null;
  const slugs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  const manifest: CoverageManifest = { features: [], scenarios: [], functions: [], links: [], scenarioLinks: [] };
  const sources: SourceCoverage = { files: [], features: [], scenarios: [] };
  const functionIds = new Map<string, number>();
  const fileIds = new Map<string, number>();

  /** @returns Line states keyed by file index, for files where at least one line ran; every file is registered. */
  const coveredLines = (files: ReportFile[]) => {
    const byFile: Record<number, string> = {};
    for (const file of files) {
      let id = fileIds.get(file.sourcePath);
      if (id === undefined) {
        id = sources.files.push({ path: file.sourcePath, source: file.source ?? '' }) - 1;
        fileIds.set(file.sourcePath, id);
      }
      const states = lineStates(file);
      if (/[+~]/.test(states)) byFile[id] = states;
    }
    return byFile;
  };

  /** @returns Call counts keyed by function id, registering functions first seen in this report. */
  const countCalls = (files: ReportFile[]) => {
    const counts = new Map<number, number>();
    for (const file of files) {
      const lineOf = lineIndex(file.source);
      for (const fn of file.data?.functions ?? []) {
        if (fn.count <= 0) continue;
        const key = `${file.sourcePath}:${fn.start}`;
        let id = functionIds.get(key);
        if (id === undefined) {
          id = manifest.functions.push({
            name: !fn.name || fn.name.startsWith('(anonymous') ? '(anonymous)' : fn.name,
            file: file.sourcePath,
            line: lineOf(fn.start),
          }) - 1;
          functionIds.set(key, id);
        }
        counts.set(id, (counts.get(id) ?? 0) + fn.count);
      }
    }
    return counts;
  };

  for (const slug of slugs) {
    const dir = path.join(featuresDir, slug);
    const report = await readReport(dir);
    if (!report) continue;
    const feature = manifest.features.push({ name: report.title, slug }) - 1;
    for (const [fn, count] of countCalls(report.files)) manifest.links.push({ feature, fn, count });
    sources.features[feature] = coveredLines(report.files);
    const scenariosDir = path.join(dir, 'scenarios');
    for (const scenarioSlug of await subdirectories(scenariosDir)) {
      const scenarioReport = await readReport(path.join(scenariosDir, scenarioSlug));
      if (!scenarioReport) continue;
      const scenario = manifest.scenarios.push({ feature, name: scenarioReport.title, slug: scenarioSlug }) - 1;
      for (const [fn, count] of countCalls(scenarioReport.files)) manifest.scenarioLinks.push({ scenario, fn, count });
      sources.scenarios[scenario] = coveredLines(scenarioReport.files);
    }
  }
  return { coverage: manifest, sources };
}
