/**
 * Isolates ES aggregation failures — e.g. a `terms` agg on a non-aggregatable
 * field ("Fielddata is disabled on [x]... Text fields are not optimised for
 * operations that require per-document field data") fails the WHOLE `_search`
 * request, not just that one sub-aggregation. Confirmed empirically against
 * both a throwaway local index and real TEST data (2026-08-10) — see
 * exploration/docs/zz Archive/cql-dynamic-field-aggregations-design.md.
 *
 * Any caller that aggregates on an arbitrary/unregistered field path must
 * run it as its own isolated request (never merged into a batched
 * getAggregations() call with other fields) and go through this wrapper, so
 * one bad field only fails its own result — it never takes down unrelated
 * aggregations in the same caller.
 *
 * AbortError always rethrows — callers own cancellation semantics.
 */
export async function isolateAggregationFailure<T>(
  run: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    return fallback;
  }
}
