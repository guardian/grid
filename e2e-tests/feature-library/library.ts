import { createHash } from 'node:crypto';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { generateMessages } from '@cucumber/gherkin';
import { IdGenerator, SourceMediaType } from '@cucumber/messages';
import type { FeatureChild, RuleChild, Step as GherkinStep } from '@cucumber/messages';
import { strFromU8, unzipSync } from 'fflate';
import type { Feature, FeatureDefinition, LibraryManifest, Run, RunStatus, ScenarioDefinition, ScenarioStatus, Step, TestOutcome } from './types.ts';

interface ParsedScenario extends ScenarioDefinition {
  expandedNames: string[];
}

interface ParsedFeature extends FeatureDefinition {
  scenarios: ParsedScenario[];
}

interface ReportResult {
  status?: RunStatus;
  retry?: number;
  duration?: number;
  startTime?: string;
  attachments?: { contentType: string; path?: string }[];
}

export interface ReportTest {
  testId: string;
  title: string;
  fileName: string;
  projectName: string;
  path?: string[];
  outcome: TestOutcome;
  duration?: number;
  results: ReportResult[];
}

interface DecodedReport {
  startTime: number;
  duration: number;
  tests: ReportTest[];
}

interface ReportArchive {
  startTime: number;
  duration: number;
  files: { fileId: string; fileName: string; tests: ReportTest[] }[];
}

const idFor = (value: string): string => createHash('sha256').update(value).digest('hex').slice(0, 16);
const stepsFor = (steps: readonly GherkinStep[]): Step[] => steps.map((step) => ({
  keyword: step.keyword.trim(),
  text: step.text,
  table: step.dataTable?.rows.map((row) => row.cells.map((cell) => cell.value)),
  docString: step.docString?.content,
}));

function errorDetail(error: unknown): string {
  if (error instanceof Error) return 'code' in error ? String(error.code) : error.message;
  return String(error);
}

export function parseFeature(source: string, file: string): ParsedFeature {
  const messages = generateMessages(source, file, SourceMediaType.TEXT_X_CUCUMBER_GHERKIN_PLAIN, {
    newId: IdGenerator.incrementing(),
    includeGherkinDocument: true,
    includePickles: true,
  });
  const errors = messages.flatMap((message) => message.parseError ? [message.parseError] : []);
  if (errors.length) throw new Error(`${file}: ${errors.map((error) => error.message).join('\n')}`);
  const feature = messages.find((message) => message.gherkinDocument)?.gherkinDocument?.feature;
  if (!feature) throw new Error(`${file}: no Feature found`);
  const pickles = messages.flatMap((message) => message.pickle ? [message.pickle] : []);
  const scenarios: ParsedScenario[] = [];
  function visit(children: readonly (FeatureChild | RuleChild)[], inheritedBackground: Step[] = [], inheritedTags: string[] = [], rule = ''): void {
    const background = [...inheritedBackground, ...children.flatMap((child) => child.background ? stepsFor(child.background.steps) : [])];
    for (const child of children) {
      if ('rule' in child && child.rule) {
        visit(child.rule.children, background, [...inheritedTags, ...child.rule.tags.map((tag) => tag.name)], child.rule.name);
      }
      if (!child.scenario) continue;
      const scenario = child.scenario;
      scenarios.push({
        id: idFor(`${file}:${scenario.location.line}:${scenario.name}`),
        name: scenario.name,
        description: scenario.description.trim(),
        line: scenario.location.line,
        rule,
        tags: [...inheritedTags, ...scenario.tags.map((tag) => tag.name)],
        background,
        steps: stepsFor(scenario.steps),
        examples: scenario.examples.map((example) => ({
          name: example.name,
          headers: example.tableHeader?.cells.map((cell) => cell.value) ?? [],
          rows: example.tableBody.map((row) => row.cells.map((cell) => cell.value)),
        })),
        expandedNames: [...new Set(pickles.filter((pickle) => pickle.astNodeIds.includes(scenario.id)).map((pickle) => pickle.name))],
      });
    }
  }
  visit(feature.children, [], feature.tags.map((tag) => tag.name));
  return { id: idFor(file), name: feature.name, description: feature.description.trim(), file, scenarios };
}

export function decodeReport(html: string): DecodedReport {
  const payload = html.match(/<template\b[^>]*\bid=["']playwrightReportBase64["'][^>]*>\s*data:application\/zip;base64,([^<]+)/)?.[1]
    ?? html.match(/(?:window\.)?playwrightReportBase64\s*=\s*["'](?:data:application\/zip;base64,)?([^"']+)/)?.[1];
  if (!payload) throw new Error('Unsupported Playwright HTML report: embedded report archive not found.');
  const archive = unzipSync(Buffer.from(payload.trim(), 'base64'));
  if (!archive['report.json']) throw new Error('Invalid Playwright report: report.json is missing.');
  const report = JSON.parse(strFromU8(archive['report.json'])) as ReportArchive;
  if (!Array.isArray(report.files)) throw new Error('Invalid Playwright report: test files are missing.');
  const tests = report.files.flatMap((file) => {
    const detail = archive[`${file.fileId}.json`];
    const tests = detail ? (JSON.parse(strFromU8(detail)) as { tests: ReportTest[] }).tests : file.tests;
    return tests.map((test) => ({ ...test, fileName: file.fileName }));
  });
  return { startTime: report.startTime, duration: report.duration, tests };
}

function featurePath(file: string): string {
  return file.replaceAll('\\', '/').replace(/\.spec\.[cm]?[jt]s$/, '').replace(/^.*?(?=features\/)/, '');
}

function matches(test: ReportTest, feature: ParsedFeature, scenario: ParsedScenario): boolean {
  if (featurePath(test.fileName) !== feature.file) return false;
  if (scenario.rule && !test.path?.includes(scenario.rule)) return false;
  return test.title === scenario.name || scenario.expandedNames.includes(test.title)
    || Boolean(scenario.examples.length > 0 && test.path?.includes(scenario.name));
}

const statusesByOutcome: Record<TestOutcome, RunStatus> = {
  expected: 'passed', unexpected: 'failed', skipped: 'skipped', flaky: 'passed',
};

export function attachResults(feature: ParsedFeature, tests: ReportTest[]): Feature {
  return {
    ...feature,
    scenarios: feature.scenarios.map((scenario) => {
      const matchingTests = tests.filter((test) => matches(test, feature, scenario));
      const ambiguous = matchingTests.some((test) => feature.scenarios.filter((candidate) => matches(test, feature, candidate)).length > 1);
      const runs: Run[] = (ambiguous ? [] : matchingTests).flatMap((test) => test.results.map((result, index) => ({
        id: `${test.testId}-${index}`,
        name: test.title,
        project: test.projectName,
        retry: result.retry ?? index,
        status: result.status ?? statusesByOutcome[test.outcome] ?? 'unknown',
        outcome: test.outcome,
        duration: result.duration ?? test.duration,
        startedAt: result.startTime,
        recordings: (result.attachments ?? []).filter((attachment) => attachment.contentType?.startsWith('video/')).map((attachment) => ({
          path: attachment.path,
          contentType: attachment.contentType,
          available: false,
        })),
      })));
      const outcomes = matchingTests.map((test) => test.outcome);
      const status: ScenarioStatus = ambiguous ? 'unmatched'
        : outcomes.includes('unexpected') ? 'failed'
          : outcomes.includes('flaky') ? 'flaky'
            : outcomes.includes('expected') ? 'passed'
              : outcomes.includes('skipped') ? 'skipped'
                : scenario.tags.includes('@todo') ? 'planned' : 'not-run';
      const { expandedNames, ...description } = scenario;
      return { ...description, status, runs };
    }),
  };
}

async function featureFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? featureFiles(fullPath) : entry.isFile() && entry.name.endsWith('.feature') ? [fullPath] : [];
  }));
  return files.flat().sort();
}

export async function createLibrary({ featuresDir, reportDir }: { featuresDir: string; reportDir: string }): Promise<{
  manifest: LibraryManifest; media: Map<string, string>; warnings: string[];
}> {
  let report: DecodedReport | undefined;
  try {
    report = decodeReport(await readFile(path.join(reportDir, 'index.html'), 'utf8'));
  } catch (error) {
    if (errorDetail(error) !== 'ENOENT') throw error;
  }
  const features: Feature[] = [];
  const media = new Map<string, string>();
  const warnings: string[] = [];
  const reportRoot = report ? await realpath(reportDir) : path.resolve(reportDir);
  for (const file of await featureFiles(featuresDir)) {
    const relativeFile = `features/${path.relative(featuresDir, file).split(path.sep).join('/')}`;
    const feature = attachResults(parseFeature(await readFile(file, 'utf8'), relativeFile), report?.tests ?? []);
    for (const scenario of feature.scenarios) {
      for (const run of scenario.runs) {
        for (const recording of run.recordings) {
          const attachmentPath = recording.path;
          delete recording.path;
          if (!attachmentPath) continue;
          try {
            const source = await realpath(path.resolve(reportRoot, attachmentPath));
            if (!source.startsWith(`${reportRoot}${path.sep}`)) throw new Error('attachment is outside the report directory');
            if (!(await stat(source)).isFile()) throw new Error('attachment is not a file');
            const extension = recording.contentType === 'video/mp4' ? '.mp4' : '.webm';
            recording.src = `media/${idFor(source)}${extension}`;
            recording.available = true;
            media.set(recording.src, source);
          } catch (error) {
            warnings.push(`${relativeFile}: ${scenario.name}: video unavailable (${errorDetail(error)})`);
          }
        }
      }
    }
    features.push(feature);
  }
  return {
    manifest: {
      generatedAt: new Date().toISOString(),
      report: report ? { startedAt: report.startTime, duration: report.duration } : null,
      features,
    },
    media,
    warnings,
  };
}