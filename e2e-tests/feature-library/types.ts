export type ScenarioStatus = 'passed' | 'failed' | 'flaky' | 'planned' | 'not-run' | 'skipped' | 'unmatched';
export type RunStatus = 'passed' | 'failed' | 'skipped' | 'timedOut' | 'interrupted' | 'unknown';
export type TestOutcome = 'expected' | 'unexpected' | 'skipped' | 'flaky';

export interface Step {
  keyword: string;
  text: string;
  table?: string[][];
  docString?: string;
}

export interface Example {
  name: string;
  headers: string[];
  rows: string[][];
}

export interface ScenarioDefinition {
  id: string;
  name: string;
  description: string;
  line: number;
  rule: string;
  tags: string[];
  background: Step[];
  steps: Step[];
  examples: Example[];
}

export interface Recording {
  contentType: string;
  available: boolean;
  src?: string;
  path?: string;
}

export interface Run {
  id: string;
  name: string;
  project: string;
  retry: number;
  status: RunStatus;
  outcome: TestOutcome;
  duration?: number;
  startedAt?: string;
  recordings: Recording[];
}

export interface Scenario extends ScenarioDefinition {
  status: ScenarioStatus;
  runs: Run[];
}

export interface FeatureDefinition {
  id: string;
  name: string;
  description: string;
  file: string;
}

export interface Feature extends FeatureDefinition {
  scenarios: Scenario[];
}

export interface LibraryManifest {
  generatedAt: string;
  report: { startedAt: number; duration: number } | null;
  features: Feature[];
}