export const FOCUSED_SORT_DEGRADATION_REVISION: 2;
export const DEGRADABLE_PERCEIVED_IDS: readonly string[];

export type SortAroundFocusWarningCategory =
  | "timeout"
  | "find-error"
  | "offset-lookup-error"
  | "neighbour-check-error";

export type DataRoute = "media-api" | "direct-es";

export interface PrivatePp3Diagnostic {
  id: "PP3";
  focusedImageId: string;
  actionStartedAt: string;
}

export function assertPrivatePp3OutputFile(file: string): void;
export function createPrivatePp3Diagnostics(directory?: string | URL): {
  file: string;
  readAndRemove(): PrivatePp3Diagnostic[];
};
export function recordPrivatePp3Diagnostic(file: string | undefined, sample: {
  id: "PP3" | "PP4";
  focusedImageId: string;
  actionStartedAt: string | null;
}): boolean;

export interface DataRequestDiagnostic {
  route: DataRoute;
  operation: string;
  startedMs: number | null;
  durationMs: number | null;
  sent: boolean;
  headersMs: number | null;
  outcome: "pending" | "ok" | "http-error" | "cancelled" | "failed";
  status?: number;
  failure?: string;
}

export interface DataRequestSnapshot {
  requests: DataRequestDiagnostic[];
  requestCaptureOverflow: number;
}

export interface CdpEventSource {
  on(event: string, listener: (event: any) => void): unknown;
  off(event: string, listener: (event: any) => void): unknown;
}

export interface DataRequestRecorder {
  stop(): void;
  snapshot(bounds: { originEpochMs: number; captureEpochMs: number }): DataRequestSnapshot;
}

export interface FocusedSortWarning {
  category: SortAroundFocusWarningCategory;
  epochMs: number;
}

export interface FocusedSortDegradation {
  degradationRevision: 2;
  reason: "timeout" | "find-error" | "focus-cleared-without-warning";
  focusedImageId: null;
  focus: "cleared";
  actionStartedAt: string | null;
  fallbackMs: number | null;
  phaseReached: "finding" | "seeking";
  warnings: Array<{ category: SortAroundFocusWarningCategory; atMs: number | null }>;
  requests: DataRequestDiagnostic[];
  requestCaptureOverflow: number;
}

export function classifySortAroundFocusWarning(text: unknown): SortAroundFocusWarningCategory | null;

export function sanitizeDataOperation(method: unknown, rawUrl: string, route: DataRoute): string;

export function createDataRequestRecorder(
  session: CdpEventSource,
  options: { classifyUrl: (url: string) => DataRoute | null; limit?: number },
): DataRequestRecorder;

export function summarizeFocusedSortDegradation(options: {
  focusedImageId: string | null;
  focus: "cleared";
  fallbackMs: number | null;
  phases: readonly string[];
  originEpochMs: number;
  warnings: readonly FocusedSortWarning[];
  network: DataRequestSnapshot;
}): FocusedSortDegradation;

export function partitionDegradedSamples<Entry extends { degraded?: { reason?: unknown } | null }>(
  entries: Entry[],
  scenarioId: string,
): {
  healthy: Entry[];
  summary: { degradedCount: number; degradedReasons: Record<string, number> } | null;
};

export function formatFocusedSortDegradation(
  sample: FocusedSortDegradation & { id: string; label?: string; runLabel?: string },
): string[];
