/**
 * Imports Gherkin definitions and Playwright HTML results into the library manifest.
 * Parsing and matching are separate from filesystem checks; createLibrary joins
 * those stages and returns a copy plan for the exporter without writing any files.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { generateMessages } from '@cucumber/gherkin';
import { IdGenerator, SourceMediaType } from '@cucumber/messages';
import type { FeatureChild, RuleChild, Step as GherkinStep } from '@cucumber/messages';
import { strFromU8, unzipSync } from 'fflate';
import type { Feature, FeatureDefinition, LibraryManifest, Run, RunStatus, ScenarioDefinition, ScenarioStatus, Step, TestOutcome } from './types.ts';

/** An intermediate scenario retaining compiled outline names for result matching. */
interface ParsedScenario extends ScenarioDefinition {
  expandedNames: string[];
}

/** Parsed source definitions, before report outcomes and recordings are attached. */
interface ParsedFeature extends FeatureDefinition {
  scenarios: ParsedScenario[];
}

/** One Playwright attempt; summary-only reports may omit status, timing or attachments. */
interface ReportResult {
  status?: RunStatus;
  retry?: number;
  duration?: number;
  startTime?: string;
  attachments?: { contentType: string; path?: string }[];
}

/** The subset of a Playwright HTML test record needed to identify and display its attempts. */
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

/** Flattened report metadata: startTime is epoch milliseconds, duration is milliseconds. */
interface DecodedReport {
  startTime: number;
  duration: number;
  tests: ReportTest[];
}

/** The embedded report.json index, whose file IDs also identify detailed JSON entries. */
interface ReportArchive {
  startTime: number;
  duration: number;
  files: { fileId: string; fileName: string; tests: ReportTest[] }[];
}

/**
 * @param value - The exact identity string, such as a source location or media path.
 * @returns A deterministic 16-character hexadecimal ID; changing the input changes the ID.
 */
const idFor = (value: string): string => createHash('sha256').update(value).digest('hex').slice(0, 16);
/**
 * @param steps - Readonly Cucumber AST steps from a background or scenario.
 * @returns Display-ready steps with trimmed keywords, cell values and doc-string content.
 */
const stepsFor = (steps: readonly GherkinStep[]): Step[] => steps.map((step) => ({
  keyword: step.keyword.trim(),
  text: step.text,
  table: step.dataTable?.rows.map((row) => row.cells.map((cell) => cell.value)),
  docString: step.docString?.content,
}));

/**
 * @param error - Any thrown value, including Node filesystem errors.
 * @returns Its error code when present, otherwise its message or string representation.
 */
function errorDetail(error: unknown): string {
  if (error instanceof Error) return 'code' in error ? String(error.code) : error.message;
  return String(error);
}

/**
 * Parses a feature without reading files or attaching execution results.
 * Cucumber's compiled scenarios (pickles) supply substituted names for outlines;
 * the original steps and example tables remain available for presentation.
 *
 * @param source - Complete Gherkin source text.
 * @param file - Logical source path, normally features/name.feature with forward slashes.
 * @returns A feature with flattened scenarios, inherited backgrounds/tags and matching names.
 * @throws When the source is invalid Gherkin or contains no Feature definition.
 */
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
  /**
   * Walks one feature/rule scope and appends its scenarios to the outer collection.
   * @param children - AST children in source order.
   * @param inheritedBackground - Ancestor background steps, prepended to local steps.
   * @param inheritedTags - Feature/rule tags inherited by every scenario in this scope.
   * @param rule - Enclosing rule name used to disambiguate report matches.
   * @returns Nothing; results accumulate in scenarios without modifying the AST.
   */
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

/**
 * Decodes Playwright's embedded ZIP, accepting template and older assignment wrappers.
 * This reads Playwright's internal HTML-report format, not its public JSON reporter format.
 *
 * @param html - Full contents of a Playwright report's index.html.
 * @returns Run timing and flattened tests, preferring detailed per-file records when present.
 * @throws For unsupported wrappers, invalid archives/JSON or missing report index fields.
 */
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

/**
 * @param file - A report path, possibly absolute, Windows-style or ending in .feature.spec.js.
 * @returns A forward-slash feature path with the generated spec suffix and leading prefix removed.
 */
function featurePath(file: string): string {
  return file.replaceAll('\\', '/').replace(/\.spec\.[cm]?[jt]s$/, '').replace(/^.*?(?=features\/)/, '');
}

/**
 * @param test - A decoded report test with its generated file name and title path.
 * @param feature - The source feature that owns the candidate scenario.
 * @param scenario - A definition with its rule and expanded outline names.
 * @returns Whether this is a candidate match; attachResults separately rejects ambiguity.
 */
function matches(test: ReportTest, feature: ParsedFeature, scenario: ParsedScenario): boolean {
  // Generated spec line numbers differ from Gherkin lines, so match paths and names instead.
  if (featurePath(test.fileName) !== feature.file) return false;
  if (scenario.rule && !test.path?.includes(scenario.rule)) return false;
  return test.title === scenario.name || scenario.expandedNames.includes(test.title)
    || Boolean(scenario.examples.length > 0 && test.path?.includes(scenario.name));
}

const statusesByOutcome: Record<TestOutcome, RunStatus> = {
  expected: 'passed', unexpected: 'failed', skipped: 'skipped', flaky: 'passed',
};

/**
 * Joins source scenarios to results across projects and retries without filesystem access.
 * Ambiguous names receive no runs; unmatched @todo scenarios are marked planned.
 *
 * @param feature - Parsed definitions, including expanded names used only during matching.
 * @param tests - All decoded report tests; unrelated feature paths are ignored.
 * @returns A new feature with aggregate outcomes and attempts. Recordings retain temporary
 * report paths and remain unavailable until createLibrary checks their files.
 */
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

/**
 * @param directory - Root directory to scan recursively; symbolic links are not followed.
 * @returns Sorted paths to regular .feature files, rooted at the supplied directory.
 * @throws If a directory cannot be read.
 */
async function featureFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? featureFiles(fullPath) : entry.isFile() && entry.name.endsWith('.feature') ? [fullPath] : [];
  }));
  return files.flat().sort();
}

/**
 * Assembles an exportable snapshot from source definitions and an optional HTML report.
 * featuresDir contains the Gherkin tree; reportDir contains index.html and its attachments.
 * A missing report is allowed, while an unreadable or malformed existing report is fatal.
 *
 * @returns The JSON-ready manifest, a map of export-relative media URLs to absolute source
 * files, and warnings for missing/unsafe attachments. No output files are written here.
 * @throws On feature parse/read failures or unsupported/corrupt reports.
 */
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
            // Resolve symlinks before containment checks so exports cannot copy files outside the report.
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