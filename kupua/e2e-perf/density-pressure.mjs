export const DENSITY_PRESSURE_STEPS = Object.freeze([30, 100, 200]);
export const DENSITY_STRUGGLE_REFERENCE = Object.freeze({
  revision: 1, minimumProgressFraction: 0.8, maximumPendingFraction: 0.2,
  maximumBlockedFraction: 0.05, maximumFrameP95Ms: 33.4,
});

export function summarizeDensityPressure(metrics) {
  const prefixes = ["early", "middle", "late"];
  const progress = [];
  const frames = [];
  for (const prefix of prefixes) {
    const values = ["RequestedResultsPerSecond", "AchievedResultsPerSecond", "PendingVisibleRatioMean",
      "BufferEdgeBlockedMs", "DrivenDurationMs", "FrameP95Ms"].map(name => metrics[prefix + name]);
    if (!values.every(Number.isFinite) || values[0] <= 0 || values[4] <= 0) {
      throw new Error("Pressure summary requires complete observed steps");
    }
    const [requested, achieved, pending, blocked, duration, frame] = values;
    progress.push(achieved / requested < DENSITY_STRUGGLE_REFERENCE.minimumProgressFraction
      || pending > DENSITY_STRUGGLE_REFERENCE.maximumPendingFraction
      || blocked / duration > DENSITY_STRUGGLE_REFERENCE.maximumBlockedFraction);
    frames.push(frame > DENSITY_STRUGGLE_REFERENCE.maximumFrameP95Ms);
  }
  return { pressureCaptureRevision: 1, struggleReferenceRevision: DENSITY_STRUGGLE_REFERENCE.revision,
    firstProgressStruggleStep: progress.includes(true) ? progress.indexOf(true) + 1 : 0,
    firstFrameStruggleStep: frames.includes(true) ? frames.indexOf(true) + 1 : 0,
    maximumTestedResultsPerSecond: Math.max(...prefixes.map(prefix => metrics[prefix + "RequestedResultsPerSecond"])),
    ...Object.fromEntries(prefixes.flatMap((prefix, index) => [[prefix + "ProgressStruggle", Number(progress[index])],
      [prefix + "FrameStruggle", Number(frames[index])]])) };
}