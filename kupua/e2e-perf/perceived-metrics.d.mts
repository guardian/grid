export interface CorrelatedEntry {
  action: string;
  phase: string;
  interactionId?: string;
}

export interface CorrelatedMetrics<Entry extends CorrelatedEntry> {
  id: string;
  label: string;
  action: string;
  interactionId: string;
  dt_ack_ms: number | null;
  dt_status_ms: number | null;
  dt_native_exit_ms: number | null;
  dt_store_ready_ms: number | null;
  dt_first_visible_frame_ms: number | null;
  dt_visual_settled_ms: number | null;
  status_total_ms: number | null;
  raw: Entry[];
}

export function computeCorrelatedMetrics<Entry extends CorrelatedEntry>(options: {
  id: string;
  label: string;
  action: string;
  requiredPhases: readonly string[];
  entries: Entry[];
  timeField?: Extract<keyof Entry, string>;
}): CorrelatedMetrics<Entry>;

export function ownsDataRoute(routes: unknown): boolean;