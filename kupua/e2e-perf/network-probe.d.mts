import type { CDPSession } from "@playwright/test";

export interface RequestSnapshot extends Record<string, number | null> {
  requestCaptureRevision: number;
  requestTimingCaptureRevision: number;
  dataTimingCompletions: number;
  dataTimingUnavailableCompletions: number;
  dataBeforeSendMaxMs: number | null;
  dataBeforeSendMeanMs: number | null;
  dataSendToHeadersMaxMs: number | null;
  dataSendToHeadersMeanMs: number | null;
  dataHeadersToCompleteMaxMs: number | null;
  dataHeadersToCompleteMeanMs: number | null;
  requestCaptureOverflow: number;
  requestCaptureTracked: number;
  requestClockMissingCount: number;
  mediaRequestStarts: number;
  mediaRequestsPending: number;
  dataRequestStarts: number;
  dataRequestsPending: number;
}

export interface RequestProbe {
  beginPhase(): void;
  snapshot(): RequestSnapshot;
  snapshotBetween(startEpochMs: number, endEpochMs: number): RequestSnapshot;
  flush(): Promise<void>;
  pendingAt(kind: "media" | "data", epoch: number): number | null;
  dispose(): void;
}

export function installNetworkProbe(): void;
export function createRequestProbe(session: CDPSession, options?: {
  limit?: number;
  dataOrigins?: string[];
  localProxyOrigins?: string[];
}): RequestProbe;