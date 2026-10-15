export type DensityWorkload = "scroll-cold" | "scroll-warm" | "table-transition" | "detail-return" | "seek" | "reflow" | "window-maintenance" | "scroll-constrained";
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
export const DENSITY_CONSTRAINED_PROFILE: "density-v2-1200pxs-80ms-4mbps-scroll-only";
export const DENSITY_WORKLOADS: readonly DensityWorkload[];
export const DENSITY_METRIC_IDS: readonly string[];
export const REQUIRED_DENSITY_METRICS: Readonly<Record<DensityWorkload, readonly string[]>>;
export function validateDensityRecord(record: unknown): DensityRecord;
export function validateDensityRun(records: unknown): DensityRecord[];
