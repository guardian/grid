export const DENSITY_PRESSURE_STEPS: readonly number[];
export const DENSITY_STRUGGLE_REFERENCE: Readonly<{
  revision: number;
  minimumProgressFraction: number;
  maximumPendingFraction: number;
  maximumBlockedFraction: number;
  maximumFrameP95Ms: number;
}>;
export function summarizeDensityPressure(metrics: Record<string, number | null>): Record<string, number>;