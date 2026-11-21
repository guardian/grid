export type DensityWorkload = "scroll-forward" | "scroll-backward" | "table-transition" | "detail-return" | "seek" | "reflow" | "window-maintenance" | "scroll-constrained" | "burst-recovery" | "scroll-endurance" | "refresh-contention";
export interface DensityScenario {
  id: string;
  scenarioRevision: number;
  density: "grid" | "justified" | "table";
  workload: DensityWorkload;
  profile: string;
  cacheClass: string;
  completionBoundary: string;
  geometryScope?: string;
}
export interface DensityRecord extends DensityScenario {
  resultRegime: "buffer" | "indexed" | "seek";
  metrics: Record<string, number | null>;
}
export const DENSITY_SCENARIOS: readonly DensityScenario[];
export const DENSITY_PROFILE: "density-v2-1200pxs-unthrottled";
export const DENSITY_CONSTRAINED_PROFILE: "density-v4-30-100-200resultsps-3x2s-80ms-4mbps-4s-recovery";
export const DENSITY_RECOVERY_PROFILE: "density-v1-4000pxs-3s-back-1.5s-forward-10s-recovery";
export const DENSITY_ENDURANCE_PROFILE: "density-v1-1200pxs-3x8s-endurance";
export const DENSITY_CONTENTION_PROFILE: "density-v1-refresh-media-overlap-80ms-4mbps";
export const DENSITY_WORKLOADS: readonly DensityWorkload[];
export const DENSITY_METRIC_IDS: readonly string[];
export const REQUIRED_DENSITY_METRICS: Readonly<Record<DensityWorkload, readonly string[]>>;
export function validateDensityRecord(record: unknown): DensityRecord;
export function validateDensityRun(records: unknown): DensityRecord[];
export function refreshComparisonMetrics(metrics: Record<string, number | null>): {
  refreshComparisonCensored: number;
  refreshDataDeltaMs: number | null;
  refreshPlacementDeltaMs: number | null;
  refreshMediaDeltaMs: number | null;
};
