/** JSON contract shared by the filesystem importer, static exporter and React viewer. */

/** Aggregate scenario state, including definitions with no run or no unambiguous match. */
export type ScenarioStatus = 'passed' | 'failed' | 'flaky' | 'planned' | 'not-run' | 'skipped' | 'unmatched';
/** The raw result of an individual attempt, not the scenario's aggregate outcome. */
export type RunStatus = 'passed' | 'failed' | 'skipped' | 'timedOut' | 'interrupted' | 'unknown';
/** Playwright's expectation-relative outcome; "expected" need not mean the attempt passed. */
export type TestOutcome = 'expected' | 'unexpected' | 'skipped' | 'flaky';

/** A source step with optional Gherkin table/doc-string arguments, preserved as plain text. */
export interface Step {
  keyword: string;
  text: string;
  table?: string[][];
  docString?: string;
}

/** A Scenario Outline's example table, kept separate from its compiled executions. */
export interface Example {
  name: string;
  headers: string[];
  rows: string[][];
}

/** Source-level scenario data, independent of whether a matching test has been run. */
export interface ScenarioDefinition {
  /** Hash of source path, line and name, used in links; source edits may change it. */
  id: string;
  name: string;
  description: string;
  /** One-based Gherkin source line, not the generated Playwright spec line. */
  line: number;
  /** Enclosing rule name, or an empty string for a feature-level scenario. */
  rule: string;
  /** Feature and rule tags followed by this scenario's own tags. */
  tags: string[];
  /** Inherited feature/rule background steps in execution order. */
  background: Step[];
  steps: Step[];
  examples: Example[];
}

/** Video attachment as it moves from an imported report into an exportable snapshot. */
export interface Recording {
  /** Reported video MIME type, such as video/webm. */
  contentType: string;
  /** True only after its source file has passed existence and report-root checks. */
  available: boolean;
  /** Export-relative media URL, populated for available recordings. */
  src?: string;
  /** Temporary report attachment path; createLibrary removes it before returning the manifest. */
  path?: string;
}

/** One browser/project attempt; multiple runs may belong to the same source scenario. */
export interface Run {
  id: string;
  name: string;
  project: string;
  /** Zero-based retry number: 0 is the initial attempt. */
  retry: number;
  status: RunStatus;
  outcome: TestOutcome;
  /** Milliseconds; falls back to summary timing when per-attempt timing is absent. */
  duration?: number;
  /** Attempt start time as an ISO date string supplied by the report. */
  startedAt?: string;
  recordings: Recording[];
}

/** A definition joined with its aggregate status and all unambiguously matched attempts. */
export interface Scenario extends ScenarioDefinition {
  status: ScenarioStatus;
  runs: Run[];
}

/** Feature-level source metadata used before and after execution results are attached. */
export interface FeatureDefinition {
  id: string;
  name: string;
  description: string;
  /** Logical, forward-slash path under features/, suitable for display and report matching. */
  file: string;
}

/** One catalogue feature containing scenarios in source order. */
export interface Feature extends FeatureDefinition {
  scenarios: Scenario[];
}

/** Serialized as library.json; relative media URLs make the exported directory portable. */
export interface LibraryManifest {
  /** ISO timestamp of snapshot generation, which is independent of the test run's date. */
  generatedAt: string;
  /** Report start is epoch milliseconds; duration is milliseconds. Null means no report was found. */
  report: { startedAt: number; duration: number } | null;
  features: Feature[];
}