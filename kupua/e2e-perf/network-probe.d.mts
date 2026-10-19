import type { CDPSession } from "@playwright/test";

export interface RequestSnapshot extends Record<string, number | null> {
  requestCaptureRevision: number;
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
  pendingAt(kind: "media" | "data", epoch: number): number | null;
  dispose(): void;
}

export function installNetworkProbe(): void;
export function createRequestProbe(session: CDPSession, options?: {
  limit?: number;
  dataOrigins?: string[];
}): RequestProbe;