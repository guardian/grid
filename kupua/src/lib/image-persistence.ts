const PERSIST_REASON_LABELS: Record<string, string> = {
  exports: "cropped",
  usages: "used",
  "persistence-identifier": "from Picdar",
  "photographer-category": "categorised as photographer",
  "illustrator-category": "categorised as illustrator",
  "commissioned-agency": "categorised as agency commissioned",
  "persisted-collection": "added to a persisted collection",
  photoshoot: "added to a photoshoot",
  leases: "leased",
};

export function humanisePersistedReasons(reasons: readonly string[], conjunction = "and"): string {
  const labels = reasons.map(reason => PERSIST_REASON_LABELS[reason] ?? reason);
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  return labels.slice(0, -1).join(", ") + ` ${conjunction} ` + labels[labels.length - 1];
}