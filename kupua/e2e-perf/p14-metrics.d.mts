export function classifyImageLookup(method: string, rawUrl: string): "direct-es" | "media-api" | null;

export function comparisonEvidenceClass(current?: { sampleCount?: number } | null,
  previous?: { sampleCount?: number } | null): "repeated" | "watchpoint";

export function deriveNavigationTiming(navigation: Pick<PerformanceNavigationTiming,
  "responseEnd" | "domContentLoadedEventEnd" | "loadEventEnd">,
paintEntries: ReadonlyArray<Pick<PerformanceEntry, "name" | "startTime">>): {
  responseEndMs: number;
  domContentLoadedMs: number;
  loadEventMs: number;
  firstPaintMs: number;
  firstContentfulPaintMs: number;
};

export function landingElapsedMs(finalCommitEpochMs: number, renderedEpochMs: number): number;

export function classifyAspectRatioChange(previousRect?: { width: number; height: number } | null,
  currentRect?: { width: number; height: number } | null): "unknown" | "same" | "changed";

interface ShiftRect { x: number; y: number; width: number; height: number }
interface ShiftSource { role?: string; previousRect: ShiftRect; currentRect: ShiftRect }

export function sanitizeLayoutShift(shift: { value: number; time: number; sources?: ShiftSource[] },
  finalCommitTime: number): {
  value: number;
  phase: "traversal" | "landing";
  sources: Array<Required<ShiftSource> & { aspectRatioClass: "unknown" | "same" | "changed" }>;
};

export function metricsAreComparable(current?: { scenarioRevision?: number; cacheClass?: string } | null,
  previous?: { scenarioRevision?: number; cacheClass?: string } | null): boolean;
export function severeRateIsReportable(metric?: { frameCount?: number } | null): boolean;