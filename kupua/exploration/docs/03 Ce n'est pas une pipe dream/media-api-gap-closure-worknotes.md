# Media-API Gap Closure — Work Notes

**Date:** 28–29 May 2026  
**Source:** Planning conversation (mk + Opus 4.6)  
**Companion doc:** `media-api-gap-closure-feasibility.md`

---

## Branch Strategy

All kupua code lives on `mk-next-next-next`. Media-api changes develop on the
same branch (because you need both to test end-to-end).

**Commit discipline:** Two commits per gap, split by folder:
- Commit A: media-api changes only (all files under `media-api/`)
- Commit B: Kupua changes only (all files under `kupua/`)

This enables clean extraction at PR time.

**PR extraction recipe:**
```bash
git fetch origin main
git checkout -b media-api/<gap-name> origin/main
git cherry-pick <commit-A-hash>
git diff origin/main --stat   # verify only media-api/ files
git push -u origin media-api/<gap-name>
```
Open PR from `media-api/<gap-name>` → `guardian/grid:main`.

After merge to main:
```bash
git checkout mk-next-next-next
git fetch origin main
git rebase origin/main   # commit A silently drops (already in main)
```

---

## Scope Confirmation

All media-api modifications are **strictly within `media-api/`** in the monorepo.
Files from `common-lib/` are referenced (helpers reused) but never modified.

---

## Argo Decision

**All new endpoints use Argo.** No exceptions, no mixed approach.

Cost varies by endpoint type:
- Scalar/aggregation responses (Gaps 3, 4, 5, 6, 7, 17, 18): trivial — `respond(data)`
- Infrastructure (Gap 2 PIT): trivial — `respond(Json.obj("pitId" -> id))`
- Image-returning (Gaps 1, 8, 12, 13): reuse existing `imageResponse.create()` / `hitToImageEntity`

---

## Enrichment Decision

**No `?enrich=false` parameter. All image-returning endpoints return fully
enriched images.**

Rationale: Kupua is read-only today but will need per-image `actions` arrays
to gate action UI (show/hide delete, edit, lease buttons) — same as Kahuna.
Designing for "skip enrichment" creates a prototype shortcut that would need
to be undone later.

Endpoints that don't return images (Gap 8 position map, Gap 13 ID range,
Gap 17 count) aren't "un-enriched images" — they're structurally different
responses that never contained images.

---

## Kupua-Side Migration Pattern: Strangler Fig

Kupua has a clean `ImageDataSource` interface. Migration uses an adapter that
delegates to direct ES for methods not yet backed by media-api. As PRs land,
methods flip one by one. No feature is gated on all gaps existing simultaneously.
The direct-ES adapter is deleted when all gaps are closed.

---

## Workplan Structure

One workplan doc per gap. No master plan. Don't write all upfront — write the
first, ship it, learn from the review cycle, then write the next batch.

**Per-gap doc contents (~50-100 lines):**
- One-line goal
- Endpoint contract (from feasibility doc)
- Files to touch (from feasibility doc)
- Kupua-side change (which `dal/` method flips)
- Test plan
- "Done when" checklist
- Out-of-scope / anti-goals

**Execution order:**
1. Gap 17 (`count`) — Trivial, validates the whole workflow
2. Gap 2 (PIT) + Gap 1 (`searchAfter`) — foundational
3. Gap 12 (`mget`), Gap 18 (`getAggregations`), Gap 11 (`includeFields`) — Easy, parallelisable
4. Gap 3, 4, 5, 6, 7, 9 — Moderate/Easy single-purpose endpoints
5. Gap 10 → Gap 8 → Gap 13 — null-zone family, Opus pre-research required
6. Gap 15 — only after human Kahuna audit

**Open question for Gap 17 specifically:** `GET /images?length=0` already returns
`total` — Kupua may not need a dedicated `/images/count` at all. Before writing
the Gap 17 plan, verify whether the existing workaround suffices. If so, use
Gap 2 or Gap 12 as the workflow-validation first PR instead.

---

## Gaps Requiring Opus Pre-Research

Gaps 8, 10, 13 (null-zone / streaming / position map). The feasibility doc flags
subtle correctness bugs that were fixed in `c1998394b`. Before Sonnet implements
these, Opus should read the kupua TS implementation in detail and write an
algorithm specification + edge case inventory.

---

## Model Assignment

- Gap workplan writing: Sonnet High
- Gap implementation (Scala): Sonnet High
- Null-zone pre-research (Gaps 8, 10, 13): Opus
- Kupua adapter wiring: Sonnet High
