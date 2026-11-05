export interface ThumbnailProbeOptions {
  density: 'grid' | 'justified' | 'table';
  sampleLimit?: number;
}

/** Numeric-only aggregate. Unsupported shift metrics and absent samples are null. */
export interface ThumbnailProbeMetrics {
  [metric: string]: number | null;
  pendingAreaRatioMean: number;
  pendingAreaRatioMax: number;
  blankViewportMs: number;
  exposureAreaMs: number;
  thumbnailPendingAreaRatioMean: number;
  thumbnailPendingAreaRatioMax: number;
  thumbnailBlankViewportMs: number;
  thumbnailExposureAreaMs: number;
  readinessLeadPxMedian: number | null;
  decodedReadinessLeadPxMedian: number | null;
  lateReadyCount: number;
  decodedCount: number;
  pendingAtEnd: number;
  failedCount: number;
  layoutShiftSupported: number;
  layoutShiftValue: number | null;
  thumbnailShiftValue: number | null;
  imageIdentityChanges: number;
  scrollDistancePx: number;
  actualSpeedPxPerSec: number;
  frameP95Ms: number | null;
  elapsedMs: number;
  exposureObservedMs: number;
  exposureStartDelayMs: number;
}

export interface ThumbnailProbe {
  stop(): ThumbnailProbeMetrics;
  dispose(): void;
}

declare global {
  interface Window {
    __kupua_thumbnailProbe?: ThumbnailProbe;
  }
}

export function installThumbnailProbe(options: ThumbnailProbeOptions): void;

type Rect = { left: number; top: number; right: number; bottom: number };
export function clipRect(rect: Rect, clip: Rect): Rect & { width: number; height: number };
export function area(rect: Rect): number;
export function readinessLeadPx(rect: Pick<Rect, 'top' | 'bottom'>, viewport: Pick<Rect, 'top' | 'bottom'>, direction: number): number | null;
export function classifyThumbnail(state: {
  hasIdentity: boolean;
  hasSource: boolean;
  failed: boolean;
  loaded: boolean;
  decoded: boolean;
}): 'placeholder' | 'missing' | 'failed' | 'loading' | 'decoding' | 'ready';
type Generation = { element: unknown; image: unknown; identity: string; source: string; selectedSource?: string };
export function sameGeneration(record: Generation, current: Generation): boolean;
export function orderChanged(previous: string[], next: string[]): boolean;
export function createSample(limit?: number): {
  add(value: number): void;
  percentile(fraction: number): number | null;
  readonly count: number;
  readonly size: number;
  readonly capacity: number;
  clear(): void;
};
export function createExposure(): {
  observe(pendingArea: number, viewportArea: number): number;
  add(dt: number, pendingArea: number, viewportArea: number): void;
  snapshot(): {
    pendingAreaRatioMean: number;
    pendingAreaRatioMax: number;
    blankViewportMs: number;
    exposureAreaMs: number;
    elapsedMs: number;
  };
};
