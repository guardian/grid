# Better suggestions: aggregation endpoint enhancement

**Done on the branch, 21 November 2026.** This enhances the existing U6c `POST /images/aggregations`; no new route, mapping change or production deployment is implied. The [API build plan](../03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md) owns the endpoint inventory.

**Delivered scope:** the API supports prefix and contains; Kupua uses prefix only. Case matching is fixed, not a caller setting. Direct ES keeps its original shortlist. Accent equivalence, exact-value exclusions and support for text-only fields were not included.

## What changes for an editor

Previously Kupua fetched popular values first and filtered that shortlist while typing. Even typing an entire rare credit could yield nothing. API-backed suggestions now select matching values **before** taking the most popular matches. `zeb` can discover `Zebra conservation` even if it is absent from the popular list. Other labels on the same image do not come along for the ride.

## Wire contract

```json
{"fields":[{"field":"userMetadata.labels","size":10,"match":{"text":"zeb","mode":"prefix"}}]}
```

- Omit `match` for the ordinary aggregation, including an empty-input popularity list. Existing callers keep their response shape, admission and size limits. No legacy GET changes.
- `prefix` means starts with; `contains` means anywhere in the whole value. Text is contiguous and literal, including punctuation. Matching uses JVM single-code-point case equivalence (lowercase of uppercase); no multi-character expansion, accent folding, normalization, tokenization or user-defined regex. Original keys, separate counts and ordinary ES terms ranking are preserved.
- At most one field per request may have a matcher; other fields and named counts retain the full admitted image scope. The matched field admits 1–50 buckets (default 10) and 1–128 UTF-16 units of input. These are conservative admission bounds, not measured CPU thresholds. They do not limit the length of stored values. Ill-typed match objects receive 400; unacceptable modes or bounds receive 422. Existing timeout/failed-shard handling still refuses incomplete counts.
- A successful matched read also returns `matchedField` naming the matched field. This lets the client accept the server's Unicode matching without re-filtering it. An older U6c that ignores `match` returns an ordinary shortlist: Kupua filters that same response locally, without retrying or switching datasource.

## Consumers and limits

[Shared providers](../../../src/lib/typeahead-fields.ts) request **prefix only**. Labels, credits, sources, suppliers, photoshoots, keywords, uploaders and crop authors use one lookup. Search chips and Refine retain current search scope minus the edited field's own query clauses. Label entry and metadata editing use the accessible library rather than browsing/selection IDs. The React field loader, CQL request lifetime and label editor's comma-token replacement remain independent. Failure leaves editing usable; optional search suggestions may be absent. Exact exclusions are not implemented.

Typed API lookups bypass cached facet shortlists. Completed and pending reads include the fragment, mode, field and scope in their identity; a narrower fragment needs its own answer. Empty input, fragments above the text bound, and temporary laptop direct ES retain shortlist behaviour. Raw dotted CQL paths use matching for XMP strings and registered aggregatable keyword/list paths; other paths retain their previous lookup (numeric terms cannot take a regex include). This neither discovers new field names nor searches inside opaque XMP structs. Fixed choices, configured alias vocabularies, catalogue categories and collection trees keep their own selection rules; categories without a catalogue use the bucket lookup.

Local and deployed media-api transports and hosted builds use the same API datasource. None of them falls back to ES. No UI currently opts into contains. Bylines and other analysed text still need whole-value index support before they could benefit; see [mapping enhancements](../mapping-enhancements.md). No reindex or accent-equivalence workaround is included.

## Evidence and limits of the measurements

Fresh CQL matched reads wait for `SUGGESTION_DEBOUNCE_MS` (150 ms) before dispatch. An identical pending read keeps its original timer; a completed answer, a field-name choice or opening an empty chip does not wait for this timer. Refine, metadata and label editors use the same setting at their existing UI boundary instead. Delays do not stack. In a locally hosted four-letter credit burst at roughly 35 ms per letter, CQL started four matched reads before this change and one afterwards (155 ms after the last letter, top option visible at 266 ms). These are browser observations, not ES CPU measurements or a repair for [KUP-041](../bug-backlog.md#kup-041).

Before implementation, sequential read-only TEST ES probes compared a top-50 shortlist, prefix and contains in a 30-day upload scope. Labels yielded only three distinct values and did not exercise truncation. For a deliberately chosen credit fragment, the shortlist returned zero matches; prefix found seven, contains thirteen (six interior-only). ES timings for credits were 16 ms shortlist, 30 ms contains, 20 ms prefix, one observation each. These direct ES probes show a discovery gap, **not** typical miss rates, deployed API latency or concurrent capacity. Different typing pauses can trigger different numbers of requests. Small responses do not bound vocabulary scanning; measure before enabling contains for a consumer. No production benchmark was run.