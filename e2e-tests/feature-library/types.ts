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
  /** Browser code coverage percentages from the combined e2e coverage report; absent when no report was found. */
  coverage?: CoverageSummary;
}

export interface CoverageSummary {
  lines: number;
  functions: number;
  branches: number;
}

/** Serialized as coverage.json: which browser functions each feature's scenarios executed. */
export interface CoverageManifest {
  /** Features with a browser coverage report; slug is the report directory name. */
  features: { name: string; slug: string }[];
  /** Scenarios with a browser coverage report; feature indexes into features. */
  scenarios: { feature: number; name: string; slug: string }[];
  /** Covered functions only; line is one-based in the original (source-mapped) file. */
  functions: { name: string; file: string; line: number }[];
  /** Indexes into features/functions; count is the number of calls during that feature's tests. */
  links: { feature: number; fn: number; count: number }[];
  /** As links, for each individual scenario. */
  scenarioLinks: { scenario: number; fn: number; count: number }[];
}

/** Serialized as source-coverage.json: source text and line-by-line coverage for each feature and scenario. */
export interface SourceCoverage {
  /** Every source file the browser loaded during the tests; source is the source-mapped original. */
  files: { path: string; source: string }[];
  /**
   * Aligned with CoverageManifest features/scenarios: file index → one character per line,
   * '+' run, '~' partly run (some branches), '-' not run, '.' not executable. Files nothing ran are omitted.
   */
  features: Record<number, string>[];
  scenarios: Record<number, string>[];
}

/** Serialized as callgraph.json: a static call graph of Kahuna's browser code with precomputed layout. */
export interface CallGraph {
  /** Source files under kahuna/; the nodes of the module view, sized by function count. */
  files: { path: string; x: number; y: number; radius: number }[];
  /** Importer → imported file indexes. */
  imports: [number, number][];
  functions: { name: string; file: number; line: number; x: number; y: number }[];
  /** Caller → callee function indexes, resolved by name; enclosing functions also link to their callbacks. */
  calls: [number, number][];
  /** Graph function index for each CoverageManifest function, or -1 when it could not be matched. */
  coverage: number[];
  /** Horizontal bands of the layered layout, top to bottom, in layout coordinates. */
  functionRows: { label: string; top: number; bottom: number; count: number }[];
  moduleRows: { label: string; top: number; bottom: number; count: number }[];
  /**
   * Network endpoints found by static analysis, with positions in the bottom band of each view. kind is fetch,
   * an HTTP method, or a Theseus relation lookup (follow/perform/link/action); label is the URL or relation name.
   */
  endpoints: {
    kind: string; label: string; function: { x: number; y: number }; module: { x: number; y: number };
    /** URL paths the Grid services advertise for this relation, e.g. `GET media-api /images/{id}`; empty if unknown. */
    paths: string[];
  }[];
  /** Function index → endpoint index for each function that makes that request. */
  network: [number, number][];
}