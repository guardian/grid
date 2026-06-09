# Grouping / Stacks — Ideation & Research

> **Created:** 2026-06-06
> **Status:** Exploratory — no implementation decisions made. Captures a design
> conversation about grouping search results by title ("shoots" / "stacks").
> **Related:** `mapping-enhancements.md` (the `title.keyword` mapping dependency),
> `01 Research/kahuna-scroll-analysis.md`, `00 Architecture…/component-detail.md`
> (data-window / position-map machinery this would interact with).

---

## The Problem

Agencies send one meaningful signal for "these images belong together": the
**title**. A shoot — "Winter Olympics 2026", "98th Oscars, Academy Awards",
"F1 - AUSTRALIAN GRAND PRIX 2026" — arrives as N images sharing one title.
A photo editor scrolling 186 Winter Olympics frames would rather see *one*
entry point per shoot and dive in selectively.

Two obstacles:

1. **`title` is not a keyword field.** It's `sStemmerAnalysed` (analysed text),
   so it can't be aggregated, sorted, or exact-matched. See
   `mapping-enhancements.md` §3 — the doc explicitly says "don't add `.keyword`
   to title, aggs on prose are meaningless". **This grouping use case is the
   counter-argument:** title is used as a *batch identifier*, not prose. That
   changes the calculus and is the one legitimate reason to add `title.keyword`.

2. **High cardinality at 9M scale.** Even with a `.keyword` sub-field, title is
   high-cardinality across the whole corpus (see measurements below), which
   rules out naive corpus-wide aggregation.

---

## Data Measurements (local 10k sample, no cluster touched)

Run against `exploration/mock/sample-data.ndjson` — purely local, no TEST/CODE/PROD
involvement. Reproduce by parsing `_source.metadata.title` + `_source.metadata.dateTaken`.

| Metric | Value | Extrapolated to 9M |
|---|---|---|
| Docs with a title | 8,277 / 10,000 (82.8%) | — (user reports ~90% for *new* uploads) |
| Unique titles | 5,479 | ~5M unique corpus-wide |
| Titles appearing 2+ times (real groups) | 1,368 | — |
| Titles appearing 5+ times | 122 | — |
| Titles appearing 10+ times | 23 | — |

Top repeated titles were all clearly shoots: "Winter Olympics 2026" (186),
"F1 - AUSTRALIAN GRAND PRIX 2026" (32), "98th Oscars, Academy Awards" (22),
"Celtic FC Media Access" (20).

### The date-scoping dead end

We briefly considered constraining a group to a single day (so a title reused
a month later is a different group). **Measurement killed this:**

| Grouping key | Unique groups |
|---|---|
| title only | 5,479 |
| (title, date) | 5,604 |

Adding the day dimension *increased* cardinality (it splits "Winter Olympics
2026" into ~10 day-buckets) — it is **not** a memory win, and semantically the
user decided 186 Winter Olympics images *should* be one group. The only case
date matters is disambiguating genuinely distinct events that share a title
across years ("Winter Olympics" 2022 vs 2026) — but those already have
different title strings in practice (`"…2026"` vs `"…2022"`), so sorting
separates them for free. **Conclusion: group by title alone; revisit a
title+year tiebreak only if real same-title-different-event collisions appear.**

---

## ES Aggregation Toolkit (what's possible)

| Want | Tool | Corpus-wide safe? | Notes |
|---|---|---|---|
| "Top N busiest groups" | `terms` agg, `min_doc_count: 2` | ✅ | Per-shard priority queue — heap cost ∝ `size × shards`, not cardinality. Approximate at high cardinality (fine for browse). |
| "How many groups exist?" | `cardinality` agg | ✅ | Single HyperLogLog number (±~5%). No buckets. Good for a status-bar "~4M groups" readout. |
| "Enumerate every group, paged" | `composite` agg + `after_key` cursor | ✅ per page | Forward-only cursor. **No total count** without consuming all pages. Impractical to fully enumerate corpus-wide, fine for scoped scroll. |
| "Representative image per group" | `composite` → `top_hits: { size: 1 }` | ✅ per page | One round-trip yields group key + count + representative thumbnail. |

Key insight: **query-scoped grouping is always cheap.** A real editorial search
(agency + date + subject) returns 50–500 docs → a `terms` agg over that filtered
set yields 5–30 exact groups instantly, regardless of corpus-wide title
cardinality. ES only aggregates over matching docs.

Representative composite query shape (title-only grouping):

```json
{
  "size": 0,
  "aggs": {
    "groups": {
      "composite": {
        "size": 20,
        "sources": [{ "title": { "terms": { "field": "metadata.title.keyword" } } }]
      },
      "aggs": {
        "representative": { "top_hits": { "size": 1, "_source": ["id", "thumbnail"] } },
        "count": { "value_count": { "field": "_id" } }
      }
    }
  }
}
```

---

## The "fake corpus-wide grouping" idea

User's framing: enable grouping on *any* search (including no search = 9M docs),
show "~4M groups in 9M matches" in the status bar (via `cardinality`), and lazily
materialise groups as the user scrolls — like image prefetch, groups are
computed just ahead of the viewport so they're ready on arrival.

**Why the status-bar number works:** `cardinality` gives an approximate total
without enumeration. That decouples "how many groups" (one cheap agg) from
"which group is at scroll position N" (the hard part).

**Why scroll geometry breaks:** see next section.

---

## The Architectural Crux: Random Access

The current scroll contract is **"give me the document at offset N"** — ES
`from/size` / `search_after` make this O(1)-ish and *seekable*. Everything in
the scroll core depends on it:

- `src/hooks/useDataWindow.ts` — windowed bidirectional fetch
- position map (image ↔ grid-position, for keyboard nav / focus restore)
- sort-around-focus, phantom-focus, `src/lib/orchestration/` paths
- URL-encoded scroll position

**Grouping destroys random access.** You cannot ask ES "give me group #847"
without having walked groups 0–846 — `composite` is a forward-only waterfall,
not a seekable stream. So in a group view:

- total scroll height is unknowable without full enumeration
- "jump to offset N" / "which group sits at pixel Y" is unanswerable
- pre-emptive loading at an *arbitrary* offset is impossible (you can preload
  *ahead* of the current cursor, not *at* a random position)

The `cardinality` count can populate a status bar but **cannot drive scroll
geometry**.

---

## Three Viable Designs (increasing cost)

### A. Sort-then-visually-group (inclusive) — cheapest, keeps everything

- Sort by `title.keyword`; identical-title docs become a contiguous run
  automatically ("consecutive" is just what sorted output looks like).
- Keep the **entire current fetch/scroll/position-map model unchanged** — same
  window, same offsets, same random access.
- Client-side: render visual dividers between runs where the title changes;
  carry last-seen title across page boundaries (overlap is already fetched for
  scroll) so a run spanning a page boundary shows "continued" not a new header.
- `cardinality` agg → status-bar group count.

| Property | Result |
|---|---|
| Scroll architecture change | None |
| Random access preserved | ✅ |
| Relevance sort | ❌ Lost (sorted by title) |
| One-image-per-group | ❌ All images shown, just separated |

**This is the recommended first prototype** — it proves whether grouping is
useful before any scroll-core risk.

### B. Click-through groups (exclusive) — moderate

- Separate route/mode: `?view=groups`. `composite` + `top_hits` renders one
  representative image per group with a count badge.
- Click a representative → navigate to document mode filtered to
  `title.keyword:"X"`. That's an ordinary scoped search — **existing scroll
  machinery works unchanged.** Back button returns via browser history.
- Group mode is forward-scroll/append-only (cursor cache for backward scroll);
  it gives up random access *within group mode*, which doesn't matter for a
  browse-shoots view.

This is the natural "browse shoots, dive into one" pattern every photo agency
site uses. Estimated small (~days), no virtualizer changes.

### C. In-place expand/collapse (exclusive) — expensive, touches scroll core

- Group mode where clicking a representative expands its images inline.
- Two hard problems:
  1. **Scroll anchoring** — inserting 185 items shifts everything below; must
     anchor the viewport to the toggled group (TanStack Virtual supports it but
     needs explicit position anchoring on toggle).
  2. **Position-map invalidation** — expand/collapse renumbers every position
     below the change. The map must be rebuilt per toggle, or made group-aware
     (`groupIndex + localIndex` pairs instead of flat integers). This is where
     bugs live.
- Best for "compare a few images across groups without losing scroll context" —
  a real but secondary workflow. Estimated ~2 weeks, real scroll-core risk.

---

## Recommended Path

```
1. Mapping: add title.keyword (+ lowercase_asciifolding normalizer).
   Additive, no existing-query behaviour change → safer than the fielddata
   approach. Still requires a re-index (see mapping-enhancements.md §7).
   NOTE: this overrides mapping-enhancements.md's "don't add .keyword to title";
   record as a deliberate decision there if pursued.

2. Prototype Design A (sort-then-visually-group). Cheap, zero scroll-core risk.
   Proves the workflow.

3. If users want collapsing/representatives → Design B (click-through). Still
   no virtualizer surgery.

4. Only if "expand inline without losing context" proves needed → Design C.
   Budget for position-map rework + e2e scroll specs.
```

**Do not build C before B before A.** Each stage produces the evidence that
justifies the next.

---

## Open Questions / Risks

- **`title.keyword` mapping change** is a Grid-wide common-lib change +
  re-index, not kupua-only. Needs team buy-in (same constraint as all of
  `mapping-enhancements.md`). User is (rightly) wary of touching real clusters;
  all analysis here was done on the local 10k sample.
- **Same-title-different-event collisions** (Winter Olympics 2022 vs 2026):
  unverified at scale. If real, a `(title, year)` composite source is the
  minimal disambiguator — but adds cardinality and complexity. Defer until
  evidence.
- **Titleless images (~10–18%)** need a defined behaviour in group mode:
  one "Ungrouped" bucket, or excluded, or fall back to individual rows.
- **Relevance vs grouping** are mutually exclusive in Designs A/B (grouping
  forces a title sort). Acceptable for a deliberate "group" mode, but the mode
  toggle must make the sort change obvious to the user.
- **Aggregation display values** if `lowercase_asciifolding` normalizer is used
  on `title.keyword`: buckets return folded/lowercased keys — use `top_hits`
  `_source.title` for display, not the bucket key (same trade-off noted in
  `mapping-enhancements.md` §2c).
