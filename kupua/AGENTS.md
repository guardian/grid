# Kupua — Agent Context

> This file is read automatically by GitHub Copilot at the start of each session.
> It provides essential context about the kupua project so the agent can pick up where it left off.

> **Directives** live in `.github/copilot-instructions.md` (auto-loaded by Copilot).
> Human-readable copy: `exploration/docs/copilot-instructions-copy-for-humans.md`.
> The two files must stay identical — see the "Directive sync rule" inside them.

## What is Kupua?

Kupua is a **new React-based frontend** for [Grid](https://github.com/guardian/grid), the Guardian's image DAM (Digital Asset Management) system. It replaces the existing **kahuna** frontend (AngularJS 1.8).

Grid manages ~9 million images stored in S3, with metadata indexed in **Elasticsearch 8.x**. Kupua lives inside the Grid monorepo at `kupua/`.

## Running Kupua

Single entry point: `kupua/scripts/start.sh`. Two modes:

| Mode | Command | ES source | Needs AWS creds? | Needs sample data? |
|---|---|---|---|---|
| **Local** (default) | `./kupua/scripts/start.sh` | Docker ES on port 9220 | No | Yes — `exploration/mock/sample-data.ndjson` (115MB, not in git) |
| **TEST** | `./kupua/scripts/start.sh --use-TEST` | SSH tunnel to TEST ES on port 9200 | Yes (`media-service` profile) | No — index + S3 buckets discovered at runtime |

**Local mode** starts Docker ES, loads sample data via `scripts/load-sample-data.sh`,
and runs Vite. If `sample-data.ndjson` is missing, startup fails. To get the file you
need access to a Grid ES cluster (CODE/TEST) to extract it — so anyone running local
mode already has credentials and knows the project. There is no credential-free path
to meaningful local development (Grid image metadata is complex; synthetic data would
be misleading).

**`--use-TEST` mode** establishes an SSH tunnel, then auto-discovers the index alias
(via `_cat/aliases`), S3 bucket names (by fetching one document and parsing URLs),
and starts the S3 thumbnail proxy + imgproxy container. Nothing is hardcoded — all
infrastructure names are resolved at runtime.

**Relationship to Grid's scripts:** Grid has its own `dev/script/start.sh` which also
has a `--use-TEST` flag and SSH tunnel logic. Kupua's `start.sh` mirrors the same
patterns (credential check, tunnel establishment, kill-on-mode-switch) but is fully
independent — it manages kupua's own Docker containers (port 9220, imgproxy on 3002)
and never touches Grid's processes. The two scripts can coexist, but both compete for
port 9200 when tunnelling to TEST, so don't run both in `--use-TEST` mode simultaneously.

## Design Documents

| Doc | Path | Summary |
|---|---|---|
| Migration plan | `exploration/docs/migration-plan.md` | Phased plan (1–6), kahuna feature inventory, data model, architecture diagram |
| Frontend philosophy | `exploration/docs/frontend-philosophy.md` | Density continuum, "Never Lost", click-to-search, adjacency algorithm, discovery, prior art (Lightroom/Photos/Finder) |
| Deviations log | `exploration/docs/deviations.md` | Intentional departures from Grid/kahuna/library conventions — **update when adding a new deviation** |
| Image optimisation | `exploration/docs/image-optimisation-research.md` | AVIF selected (q63/s8 defaults). Format analysis (WebP/AVIF/JXL), encode benchmarks, DPR-aware sizing, encoding chain archaeology, format decision with trade-offs |
| Performance analysis | `exploration/docs/performance-analysis.md` | 36 findings (fix-now/fix-later/watch), imgproxy benchmark, Lighthouse audit, scrubber prereqs |
| Grid view plan | `exploration/docs/grid-view-plan.md` | Kahuna grid analysis, architecture stress tests, design decisions |
| Kahuna scroll analysis | `exploration/docs/kahuna-scroll-analysis.md` | `gu-lazy-table`, sparse arrays, `from/size`, 100k cap. Lessons for `useDataWindow` |
| `search_after` plan | `exploration/docs/search-after-plan.md` | Windowed buffer, PIT, scrubber, sort-around-focus. 13-step plan, test checkpoints A–D |
| Scrubber nonlinear research | `exploration/docs/scrubber-nonlinear-research.md` | Power curve k=2 recommendation. Tried & rejected — revisit when scrubber is mature |
| Scrubber dual-mode ideation | `exploration/docs/scrubber-dual-mode-ideation.md` | Scroll mode vs seek mode, bug analysis (fixed), adaptive buffer fill (done), visual philosophy, data demands. Steps 1–2 complete, 3–4 pending. **Tooltip ideation section** added: prior art (immich, Google Photos, YouTube, Lightroom, VS Code minimap), 6 themes (richer labels, track markers, content preview, progressive disclosure, search context, animation), prioritised recommendations (Tier 1–3), kill list, open questions, perf notes |
 Rendering perf plan  `exploration/docs/rendering-perf-plan.md`  Systematic rendering performance audit — baselines at 1400px, Retina, 4K. Issue taxonomy (A–F), work plan, quantitative gates
 Rendering perf session plan  `exploration/docs/rendering-perf-session-plan.md`  Succinct handoff for next agent session — Retina analysis, prioritised steps, files to read
| **Perf measurement report** | **`exploration/docs/perf-measurement-report.md`** | **Phases 0–C measured results. focusDrift data recovered (was always recorded, stripped by harness — now fixed). P4a=0px, P4b=−160px, P6=428px. P8 domChurn=~57k unchanged. P12 regression was noise. Read before further perf work.** |
| **Traversal perf investigation** | **`exploration/docs/traversal-perf-investigation.md`** | **Era 2→3 prefetch regression: 400ms debounce killed the rolling pipeline. Fix: fire-and-forget `new Image().src` + direction-aware + `fetchPriority="high"` + T=150ms throttle gate. Landing 0ms across 7/8 tiers (E5-rapid 290ms → contention). Full experiment data, throttle analysis with mathematical proof.** |
| Panels plan | `exploration/docs/panels-plan.md` | Left (filters + collections) / right (metadata), resize, keyboard, agg perf/safeguards |
| Metadata display plan | `exploration/docs/metadata-display-plan.md` | Kahuna `gr-image-metadata` analysis, field visibility, click-to-search, phased build |
| Changelog | `exploration/docs/changelog.md` | Blow-by-blow development history extracted from this file. Full detail on every feature, bug fix, and decision |
| Directives (human copy) | `exploration/docs/copilot-instructions-copy-for-humans.md` | Identical to `.github/copilot-instructions.md` — for humans and fresh clones |

## Current Phase: Phase 2 — Live Elasticsearch (Read-Only)

**Goal:** Connect kupua to real ES clusters (TEST/CODE) via SSH tunnel to validate against ~9M images. Still read-only, no auth, no Grid API. Phase 1 (local sample data) is complete.

### What's Done

> Full build-by-build history in `exploration/docs/changelog.md`.

**Infrastructure:** Docker ES 8.18.3 on port 9220, `start.sh` (local + `--use-TEST` modes), S3 thumbnail proxy, imgproxy (port 3002), sample data pipeline, mock Grid config. Colour tokens: `grid-bg` (#333 chrome), `grid-cell` (#393939 image cells), `grid-cell-hover` (#555 pill hover). `<meta name="theme-color" content="#333333">` for browser chrome tinting.

**DAL:** `ImageDataSource` interface → `ElasticsearchDataSource` adapter. `searchAfter()` + PIT (primary pagination, with PIT 404/410 fallback — retries without PIT on stale-PIT error), `countBefore()`, `estimateSortValue()`, `findKeywordSortValue()`, `getKeywordDistribution()`, `getDateDistribution()`, batched `getAggregations()`. Write protection on non-local ES. `MockDataSource` for tests.

**State:** Zustand `search-store` with windowed buffer (max 1000, `bufferOffset`, cursor-based extend/evict/seek). Scroll-mode fill: when `total ≤ SCROLL_MODE_THRESHOLD` (env var, default 1000), `_fillBufferForScrollMode()` eagerly fetches all remaining results after the initial page (two-phase: 200 results instant, rest in background). `imagePositions: Map` maintained incrementally. Sort-around-focus ("Never Lost") via `_findAndFocusImage()`. PIT lifecycle, new-images ticker, aggregation cache + circuit breaker. `column-store` + `panel-store` (both localStorage-persisted).

**URL:** Single source of truth. `useUrlSearchSync` → store → search. Custom `URLSearchParams`-based serialisation (no `qss`). `resetSearchSync()` for forced re-search. `image` param is display-only. All search params Zod-validated.

**CQL:** `@guardian/cql` parser + custom CQL→ES translator. `<cql-input>` Web Component. `LazyTypeahead` for non-blocking suggestions. Escape blurs search box (only when typeahead popup is not visible). Supports structured queries (`credit:"Getty" -by:"Foo"`), `fileType:jpeg` → MIME, `is:GNM-owned`.

**Table view** (~1300 lines): TanStack Table + Virtual (overscan 5 — reduced from 20 for -61% severe jank), column defs from `field-registry.ts` (23 hardcoded + config-driven alias fields). Column resize (auto-scroll at edges, CSS-variable widths, memoised body during drag), auto-fit (double-click header, `<canvas>` measurement), column visibility context menu, sort on header click (shift-click for secondary), sort aliases, auto-reveal hidden columns on sort. Click-to-search (shift/alt modifiers, AST-based polarity flip). Row focus (sticky ring highlight), double-click to open image detail. ARIA roles throughout. List fields (pills) render single-line with overflow clip. Cell divs use `contain: layout` + `overflow-hidden` (prevents pill reflow propagation, no visible effect on CLS but architecturally correct). Horizontal scrollbar via proxy div (synced `scrollLeft`, `ResizeObserver` on table root); vertical scrollbar hidden (replaced by Scrubber). Scroll effects delegated to shared `useScrollEffects` hook.

**Grid view** (~470 lines): Responsive columns (`ResizeObserver`, `floor(width/280)`), 8px cell gap, row-based TanStack Virtual, S3 thumbnails, cell layout matching kahuna (303px height), rich tooltips, focus ring + grid-geometry keyboard nav, scroll anchoring on column count change, density-switch viewport preservation (saves localIndex alongside ratio to survive imagePositions eviction). Scroll effects delegated to shared `useScrollEffects` hook; only column-change anchoring stays inline (grid-specific).

**Scroll effects** (`src/hooks/useScrollEffects.ts`, ~555 lines): Shared hook consolidating all scroll lifecycle effects that were duplicated between ImageGrid and ImageTable, plus the imperative scroll-reset orchestration. Takes a `ScrollGeometry` descriptor (`rowHeight`, `columns`, `headerOffset`, `preserveScrollLeftOnSort`) to handle structural differences between grid and table. Contains: scroll container registration (Scrubber), virtualizer reset (module-level ref, no callback indirection), `handleScroll` + listener, buffer-change re-fire, prepend/forward-evict scroll compensation, seek scroll-to-target, search-params scroll reset with sort-around-focus detection, bufferOffset→0 guard, sort-around-focus generation scroll, density-focus mount restore + unmount save. Density-focus mount restore calls `abortExtends()` before the rAF chain to prevent extends (and their prepend/evict compensation) from firing during the settle window — without this, post-restore scroll events trigger `reportVisibleRange` → `extendBackward` → prepend compensation that gets clamped at `maxScroll`, losing pixels each density-switch cycle (the "drift" bug). The restore intentionally does NOT dispatch a synthetic scroll event — the scrubber thumb syncs via effect #3 (buffer-change re-fire) and the next real user scroll. After computing the raw scroll target from the saved ratio, the restore applies **edge clamping**: if the focused item would be partially clipped at the top (behind the sticky header) or bottom of the viewport, `scrollTop` is nudged so the full row is visible flush at that edge — same pattern as sort-around-focus (effect #9). Density-focus and sort-focus transient bridges are inlined as module-level state within the hook. Exports `resetScrollAndFocusSearch()` — the imperative function called by SearchBar and ImageDetail for logo/metadata clicks (orchestrates abortExtends → DOM scrollTop reset → virtualizer reset → visible range reset → scrubber thumb reset → CQL focus). Uses ref-stabilised callbacks (A.1 pattern) to avoid scroll listener churn.

**Scrubber** (~1010 lines): Vertical track, proportional thumb, click-to-seek, drag-to-seek (deferred to pointer up, linear). Two modes: **scroll mode** (all data in buffer — drag directly scrolls content, no seek) and **seek mode** (windowed buffer — drag previews position, seek fires on pointer-up). Scroll-mode continuous sync attaches a scroll listener to the content scroll container for pixel-perfect thumb tracking (`scrollTop / maxScroll` ratio); a `MutationObserver` on the content column re-attaches the listener when the scroll container element changes (density switch replaces ImageGrid ↔ ImageTable, creating a new DOM element). Scroll mode activates when `total ≤ SCROLL_MODE_THRESHOLD` (env-configurable, default 1000): after the initial page loads, `_fillBufferForScrollMode()` fetches remaining results in PAGE_SIZE chunks (two-phase: user sees first 200 instantly, rest loads in background). Unified visual style for both modes: narrow 8px pill thumb (inset within 14px hit-target track), semi-transparent white (`rgba(255,255,255, 0.25/0.45/0.6)` for idle/hover/active), transparent track, no cursor change. Deep seek via percentile estimation (date/numeric) or composite aggregation (keyword). Sort-aware tooltip (date/keyword context, live during drag) — **keyword sorts use a pre-fetched keyword distribution** (composite agg, all unique values with doc counts in sort order, fetched lazily on first scrubber interaction, cached per query+sort). Width/Height sorts also use the keyword distribution pipeline (composite agg on `source.dimensions.width`/`height`, raw numeric keys formatted via `format` function to `"4,000px"`). Binary search gives the correct keyword value at any position O(log n) with zero network during drag. Date sorts use linear buffer extrapolation with **adaptive granularity**: format adapts based on total result set time span and local viewport density — `d Mon yyyy` (default), `Mon yyyy` (when scrubbing fast, each viewport covers >28 days), `d Mon, H:mm` (when total span <28 days and local density is sub-day). Three simple rules, no racing hours on large sets. Fixed-width `<span>` wrappers for day/month/time prevent tooltip width jitter within a granularity level. **Tooltip is always-rendered** (opacity-controlled, not conditionally mounted) — `tooltipRef` is always valid for direct DOM writes during drag; fade-in 150ms ease-in, suppression via `opacity: 0`. Tooltip bottom-edge clamped using measured `offsetHeight` (not a magic number). Callback ref for ResizeObserver. Seek cooldown (500ms). Thumb position controlled exclusively via DOM writes (useEffect + applyThumbPosition) — inline JSX intentionally omits `top` to prevent React reconciler from fighting direct DOM writes during drag. Position mapping uses symmetric `(total - visibleCount)` in both directions. Stable `thumbVisibleCount` prevents thumb height fluctuation during scroll-mode drag. `onFirstInteraction` prop triggers lazy data fetches (keyword distribution) on first click/drag/keyboard. **Track tick hover animation** — ticks animate on hover: minor ticks elongate to the left (extending beyond the track), major ticks grow wider still, both with 200ms CSS transitions on `left`/`right`/`background-color`. Major ticks are visually distinguished: wider extent and brighter opacity (both idle and hovered). **Tick labels on hover** — `TrackTick` now carries an optional `label` field (year numbers, month abbreviations, day+month depending on resolution); labels fade in on hover (250ms, 50ms delay so growth leads), positioned absolutely left of the track (9px font, semi-transparent). **Label decimation** — two-pass algorithm: major labels placed first (including promoted ticks — they win spacing ties), then minor labels fill remaining gaps. Minimum 18px vertical gap prevents overlap when ticks are dense. **Isolation-based promotion** — minor year-boundary ticks (Januaries with 4-digit year labels) that sit ≥80px from any major tick are promoted to major visual treatment (wider, bolder, brighter). This handles long-span distributions where a year like 2022 sits alone in the middle of the track surrounded only by month ticks — it becomes a visual landmark even though the decade hierarchy says it's minor. Month abbreviation ticks are never promoted. **Long-span year labels** — all January ticks carry a year label regardless of the decade hierarchy; the Scrubber's label decimation controls which are visible based on available pixel space. Labels overflow the 14px scrubber div leftward — `PanelLayout` parent div changed from `overflow-hidden` to `relative` to prevent clipping. See `exploration/docs/scrubber-dual-mode-ideation.md` for the full design rationale and tooltip ideation (prior art, 6 themes, prioritised recommendations).

**Panels:** Left (facet filters + future collections) / right (focused-image metadata). Resize handles (double-click to close), `[`/`]` keyboard shortcuts. AccordionSection with persisted open/closed state. Facet filters: batched aggs, click/alt-click to add/exclude CQL chips, "Show more" per field (100-bucket request), scroll-anchored collapse. Right panel: shared `ImageMetadata.tsx` — **registry-driven**: iterates `DETAIL_PANEL_FIELDS` (all fields except `detailHidden`), groups into sections on `detailGroup ?? group` change, respects `detailLayout` (stacked/inline), `detailClickable` (false suppresses search links on Description/Special instructions/Filename). Alias fields displayed with labels, clickable. Width/Height hidden (Dimensions shown instead). Image ID always shown (monospace, select-all).

**Image detail:** Overlay within search route (`opacity-0` search page preserves scroll). `[x] of [total]` counter, prev/next with auto-load near edge, direction-aware prefetch pipeline (4 ahead + 1 behind, fire-and-forget `new Image().src`, `fetchPriority="high"` on main `<img>`, T=150ms throttle gate suppresses prefetch batches during held-key rapid traversal to reduce imgproxy contention — see `traversal-perf-investigation.md`), fullscreen survives between images. Standalone fetch for direct URLs. **Position cache** in sessionStorage — stores offset + sort cursor (`SortValues`) + search fingerprint; on reload, `restoreAroundCursor` uses the cursor for precise `search_after` + `countBefore` restoration at any depth (no percentile estimation), recovering the counter and prev/next navigation. Works at any position in a 9M result set. Falls back to approximate `seek()` for old cache entries without a cursor. Both `restoreAroundCursor` and `_findAndFocusImage` (sort-around-focus) share `_loadBufferAroundImage` — the core bidirectional `search_after` + buffer assembly helper. `loadRange` removed (dead code). **Format: AVIF** (imgproxy defaults, q63/s8, `AOM_TUNE_SSIM`). **DPR-aware sizing:** `detectDpr()` two-tier step function — DPR ≤1.3 → multiplier 1 (CSS pixels), DPR >1.3 → 1.5 (HiDPI bump without 4× pixel count of full 2×). Capped at native resolution. See `image-optimisation-research.md`.

**Toolbar / Status bar / Filters:** Search bar (logo, CQL input, clear), filter controls (free-to-use, date range dropdown), sort dropdown + direction toggle. Status bar: result count (never replaced by loading), new-images ticker, ES timing, density toggle, panel toggles (tab-merge effect).

**Routing:** TanStack Router. `/search` (main), `/images/$imageId` (redirect), `/` → `/search?nonFree=true`. Image detail as same-route overlay, not separate route.

**Keyboard nav** (~327-line shared hook): Arrow/Page/Home/End, two-phase handling (bubble + capture), `f` for fullscreen, bounded placeholder skipping, prefetch near edge. Native input guard (`isNativeInputTarget`) prevents arrow keys from stealing focus in `<input type="date">` etc.

**Performance:** 36 findings documented. All 5 fix-now items done. Windowed buffer resolved memory/depth issues. Lighthouse: Perf 61 (dev), A11y 94, BP 96. Imgproxy benchmark confirms prefetch is correct mitigation. **Rendering perf experiments (29 Mar 2026):** P8 table scroll improved significantly — reduced virtualizer overscan (20→5, -61% severe frames, -49% P95), added `contain: layout` + `overflow-hidden` on gridcell divs. Combined: max frame 300→217ms, severe 36→14, P95 67→34ms, DOM churn 76k→42k. CLS 0.041 accepted as inherent to virtualiser recycling (SPAN pill shifts during row recycle — false positive, invisible during scroll). `content-visibility: auto` on rows (no effect — virtualiser already manages DOM), `contain: strict` on cells (broke flex height), PAGE_SIZE 200→100 (more frequent extends = more jank), `startTransition` on density toggle (broke P12 drift) — all tried and reverted. See `rendering-perf-plan.md` for full experiment data. **Phase A micro-optimisations (30 Mar 2026):** A.1 `handleScroll` stabilised in both ImageTable and ImageGrid — virtualizer stored in ref, `loadMore` in ref; dep arrays reduced; eliminates listener re-registration per render. A.2 `columnIndices` memoized in ImageGrid — avoids `Array.from` allocation per row per render (was ~5,400 arrays/sec at 60fps). A.3 Canvas font cached in `measureText` — only reassigns `ctx.font` when font string changes; column auto-fit now triggers exactly 2 parses instead of ~600. ~~A.4 GridCell key changed from flat index to `image.id`~~ — **reverted (31 Mar 2026)**: content-based keys in a positional virtualizer cause visible reordering during seeks/searches (React reuses component instances at wrong virtual positions, fighting TanStack Virtual's layout). The 14–18% domChurn reduction on backward extends was not worth the user-visible reordering regression. Keys are now positional (`key={imageIdx}`). A.5 `ids.join(",")` replaced with O(1) sentinel (`first|last|count`) in visibleImages memo. **Measured gains (Phase A):** P3 seek max frame −30%, DOM churn −53%, LoAF −40%; P7 scrubber drag max frame −29%, LoAF −38%; P8 table scroll max frame −16%, LoAF −14%; P11 DOM churn −17%; P14 traversal max frame −24%. **Phase B scrubber decoupling (31 Mar 2026, C6+C7+C22):** Eliminated all DOM archaeology from Scrubber. New `src/lib/scroll-container-ref.ts` module — module-level register/get pattern. `useScrollEffects` hook registers on mount/unmount; `Scrubber.tsx` and `resetScrollAndFocusSearch()` call `getScrollContainer()`. `findScrollContainer` function + sibling-walk + `MutationObserver` all removed from Scrubber. Tooltip height magic number `trackHeight - 48` replaced with `trackHeight - (tooltipRef.current?.offsetHeight || 28)` (C7). Measured: P7 LoAF 133→47ms (held Phase A gain); P3/P8 neutral — single-run variance on network-dominated tests; no regressions. P8 P95 still at 50ms — next target. **Phase C header measurement (31 Mar 2026, C1):** New `src/hooks/useHeaderHeight.ts` — ResizeObserver callback-ref hook. `ImageTable` replaces the `TABLE_HEADER_HEIGHT = 45` constant in `scrollPaddingStart` and `useListNavigation`'s `headerHeight` with the live-measured value (falls back to the constant on the first frame). Fires at most once per session on mount; never fires during scroll. Zero perf cost. **Post-perf regression fixes (31 Mar 2026):** Three issues from `post-perf-fixes.md`: (1) **Home button after deep seek** — virtualizer reset pattern (now module-level ref in `useScrollEffects.ts`, originally `scroll-reset-ref.ts`): density components register `virtualizer.scrollToOffset(0)` callback; `resetScrollAndFocusSearch()` fires it alongside DOM `scrollTop=0`. Ensures virtualizer internal state is always zeroed on Home/logo click. (2) **A.4 GridCell key reverted** — content-based keys caused visible image reordering during seeks/searches (see above). (3) **Sort-around-focus ratio preservation (P6)** — new `sort-focus.ts` bridge (module-level save/consume pattern). The scroll-reset effect captures the focused item's viewport ratio before sort; the `sortAroundFocusGeneration` effect restores it at the new position. Replaces `scrollToIndex(center)`. (4) **Density-switch header offset fix (P4b)** — table unmount save now includes `HEADER_HEIGHT` in the viewport ratio calculation so table→grid switches account for the sticky header. **Scroll architecture consolidation (1 Apr 2026):** New `src/hooks/useScrollEffects.ts` extracts all duplicated scroll effects from ImageGrid (~280 lines removed) and ImageTable (~300 lines removed) into a shared hook parameterised by a `ScrollGeometry` descriptor. Zero behavioural change (all 70 E2E tests pass). Also fixed a pre-existing bug in the table's sort-only detection: clearing `orderBy` (switching to default sort) was not treated as a sort-only change, breaking sort-around-focus when the user switched back to default sort order. Module-level bridges (`density-focus.ts`, `sort-focus.ts`) absorbed into the hook as private module-level state (Step 2). `scroll-reset.ts` and `scroll-reset-ref.ts` absorbed into the hook (Step 3) — `resetScrollAndFocusSearch()` is now exported from the hook module, using a module-level virtualizer ref instead of callback indirection. `scroll-container-ref.ts` remains separate (shared with Scrubber). Step 4 (search-store cleanup) assessed as no-op — the store's `_seekCooldownUntil` in `search()` is independently needed for the URL-sync-triggered search path and cannot be removed without losing buffer protection. Part A complete. **Bug #17 fix (1 Apr 2026):** Density-focus mount restore at deep scroll positions failed for three reasons, all related to React Strict Mode double-mounting: (1) mount effect used `geo.columns` from useState default (4) instead of the real DOM-measured column count — fixed by adding `minCellWidth` to `ScrollGeometry` and computing real columns from `el.clientWidth` at mount; (2) `consumeDensityFocusRatio()` destructively cleared the saved state on the first phantom mount, leaving null for the real mount — fixed by splitting into `peekDensityFocusRatio()` + `clearDensityFocusRatio()` (clear only after rAF scroll is applied); (3) Strict Mode's cleanup of the first phantom mount re-saved density-focus state with wrong geometry (columns=4, scrollTop=0, headerOffset=0), overwriting the real component's valid save — fixed by guarding `saveDensityFocusRatio` to skip when a pending unconsumed state already exists. Mount restore now uses double-`requestAnimationFrame` to defer until the virtualizer spacer has correct totalSize and the ResizeObserver has set real columns. 2 previously-skipped Bug #17 tests unskipped and passing (72 total, 0 skipped).

**E2E tests:** 71 Playwright tests pass (62 scrubber + 9 buffer corruption, 0 skips). `run-e2e.sh` orchestrates Docker ES + data + cleanup. `KupuaHelpers` fixture class (shared by `e2e/` and `e2e-perf/`). 10 smoke tests for TEST cluster (manual-only, auto-skip on local). Console telemetry capture for algorithmic assertions. **Density-focus drift regression test:** `density-focus survives 5+ toggles at deep scroll without drift` — seeks to 0.8, scrolls deep, focuses at 75th% of buffer, toggles 5 times, asserts visibility each toggle. Verified to fail without fix (stash/pop). Subsumes the previous two single-switch Bug #17 visibility tests. **Buffer corruption regression suite (31 Mar 2026):** 9 tests in `e2e/buffer-corruption.spec.ts` — logo click (grid + table), repeated logo clicks, logo from ImageDetail, metadata click, real-time buffer monitoring (Zustand subscriber), CQL query change, extends recovery after cooldown, seek stability. All 9 fail without the fix and pass with it. Standalone config `playwright.run-manually-on-TEST.config.ts` for manual runs against real ES (no globalSetup safety gate). **Safety gate:** `global-setup.ts` refuses to run if the Vite dev server is proxying to a real cluster (>50k docs detected via `/es/images/_count`). **Perf test infrastructure (Phase 0, 30 Mar 2026):** `rendering-perf-smoke.spec.ts` moved to `e2e-perf/perf.spec.ts` (renamed + extended); tests now emit structured JSON metrics via `emitMetric()` to `results/.metrics-tmp.jsonl`; `e2e-perf/run-audit.mjs` harness reads them, diffs against prior run, writes `audit-log.json` + `audit-log.md`; result set pinned via `PERF_STABLE_UNTIL` env var (fixed at `2026-02-15T00:00:00Z` — hardcoded so the corpus never changes between runs). 16 tests (P1–P16): P3b (keyword sort seek), P4 split into P4a/P4b, P11 simplified (3 seeks), P11b (Credit sort variant), P13 (image detail enter/exit), P14 (image traversal), P15 (fullscreen persistence), P16 (column resize). P10 marked `report:false` in harness. Raw pixel literals (280/303/32) replaced with shared constants from `src/constants/layout.ts`. **Experiments infrastructure (1 Apr 2026):** `e2e-perf/experiments.spec.ts` — agent-driven A/B testing of tuning knobs (E1 table scroll, E2 grid scroll, E3 density switch, E4 image detail traversal, E5 fullscreen traversal, E6 smooth autoscroll). **v2 speed tiers (recalibrated 1 Apr 2026):** dropped middle/slow tiers across all experiments (too close to slow to produce different behaviour or measuring imgproxy latency not app behaviour), added aggressive top tiers to push past buffer edges and trigger extend/evict cycles. Wheel scroll tiers: slow 100px/300ms (~300 px/s), fast 200px/100ms (~2,000 px/s), turbo 400px/50ms (~8,000 px/s) — wheel counts duration-normalised to ~5s (17/50/100 events). Smooth autoscroll tiers (E6): brisk 20px/frame (~1,200 px/s), fast 50px/frame (~3,000 px/s), turbo 100px/frame (~6,000 px/s) — crawl and gentle dropped (can't reach extend threshold even at 15s). E6 duration 15s to exercise extend/evict cycles. Traversal speed tiers: slow 1000ms, moderate 500ms, fast 200ms, rapid 80ms (held-down arrow key, tests image load cancellation). Per-tier browser cache clearing via CDP `Network.clearBrowserCache` (prevents cross-tier cache contamination). **Landing image timing:** after traversal loop, measures how long the FINAL image takes to render with 5s timeout — the user-facing metric that matters most. E5 clears browser cache via CDP before running (prevents E4 cache warming from tainting fullscreen render times). **Traversal investigation (1 Apr 2026):** E4/E5 experiments used to diagnose and validate the Era 2→3 prefetch regression fix. 3 baseline runs + 2 post-fix runs against TEST (1.3M docs). Results: landing image 0ms across 7/8 tiers, E5-rapid 290ms (imgproxy contention). Full analysis in `traversal-perf-investigation.md`. 17 total scenarios (E1×3, E2×3, E3×1, E4×4, E5×4, E6×6). Jank normalisation: all output includes `severePerKFrames` (severe frames per 1000 frames) for direct comparison across speed tiers regardless of measurement duration — stored in JSON snapshots and logged to console. E4/E5 record per-image render timing: srcChangeMs, renderMs, rendered via img.complete + naturalWidth polling. Also tracks imgproxy request count, cache hits, avg duration per speed tier. Corpus pinned via hardcoded `STABLE_UNTIL` matching perf tests. Probe self-test diagnostics. Safety bounds in source header and README. Full signals glossary in `e2e-perf/results/experiments/README.md`. Viewport matches perf tests (1987×1110, DPR 1.25). Results to `e2e-perf/results/experiments/` (v1 baseline archived in `v1-baseline/` subdirectory). Separate `playwright.experiments.config.ts`. Documented in `exploration/docs/tuning-knobs.md`. **Format comparison experiments (2 Apr 2026):** E4/E5 reused to A/B test three image formats at DPR 1.5× — WebP q79 (baseline), AVIF q63/s8, JXL q77/e4 (with `--enable-features=JXLDecoding` on Chromium 145). AVIF wins: 9-15% smaller than WebP, comparable decode, 0ms landing through fast tier. JXL disqualified: worst jank (severe/kf 53-60 at rapid), worst decode gaps (442ms max), largest files. Also caught a stale `IMGPROXY_AVIF_SPEED=7` container that was tainting initial AVIF runs — fast tier regressed from 0ms to 243ms until fixed to speed 8 default. Full data in `image-optimisation-research.md`.

### What's Next

**Buffer corruption fix (31 Mar 2026) ✅** — see `exploration/docs/buffer-corruption-fix.md` for full analysis. 5-layer defense-in-depth fix for the synchronous→async race between scroll reset and buffer extension. Bug was introduced by commit `3fca3d676` which removed the seek cooldown refresh at data arrival. Fix: `abortExtends()` before synthetic scroll (Layer 1), cooldown in `search()` (Layer 2), seek cooldown restore (Layer 3), abort check before PIT-404 retry (Layer 4), `abortExtends()` exposed on store (Layer 5). E2E validated locally (70 pass, 2 skip).

**Remaining P4b investigation:** The header-offset fix is applied (table unmount save now includes HEADER_HEIGHT). The −160px drift may also have a secondary cause — validate with perf harness after E2E passes. If drift persists, add diagnostic logging per `post-perf-fixes.md` §P4b.

- [ ] **Investigate P8 domChurn=~57k** — approaches documented in `focus-drift-and-scroll-handoff.md`; likely reducible 15–25% but structural root cause cannot be eliminated without skeleton rows.
- [ ] **Phase D refinements** (lower priority, each independent): ~~D.1 density-focus `saved` ref~~ (resolved — absorbed into `useScrollEffects` module scope, same safety guarantees); D.2 font strings from CSS custom properties (C5 — low value, constants are stable compile-time values); D.3 viewport-aware panel constraints (C10 — requires design discussion before implementing).
- [ ] **Scrubber scroll-mode visual polish** (Step 3 of `scrubber-dual-mode-ideation.md`) — make scroll mode look like a native Chrome/macOS overlay scrollbar: thinner track, rounded thumb, fade in/out on hover/idle. Currently looks identical in both modes.
- [ ] **Raise scroll-mode threshold** (Step 4) — increase `VITE_SCROLL_MODE_THRESHOLD` beyond 1000, validate with real data transfer sizes. Grid view could go to 10k+, table view ~2-5k.
- [ ] Column reordering via drag-and-drop (extend `column-store.ts` to persist order)

### Known Performance Issues (established 31 Mar 2026)

> Full data: `exploration/docs/perf-measurement-report.md`. All phases 0–C measured.

- **P8 (table fast scroll) unchanged across all phases.** p95=50ms, domChurn=~57k, LoAF=~870ms. The coupling fixes did not address this — they were never going to. Root cause is virtualiser DOM churn at ~57k mutations/session. Requires a different approach (see perf report §5).

- **P6 focusDrift — fixed (31 Mar 2026).** Sort-around-focus now uses ratio preservation (`sort-focus.ts`) instead of `scrollToIndex(center)`. Awaiting perf harness validation to confirm drift is eliminated.

- **P4b focusDrift — partially fixed (31 Mar 2026).** Table unmount save now includes HEADER_HEIGHT offset. Awaiting perf harness validation. If drift persists, a secondary cause exists (see `post-perf-fixes.md` §P4b for diagnostic steps).

- **A.4 GridCell key reverted (31 Mar 2026).** Content-based keys caused visible image reordering during seeks/searches. Expect P3/P11 domChurn to increase 14–18% (back to pre-A.4 levels). Visual improvement is worth the perf trade-off.

### Deferred to Later Phases
- [ ] **Non-linear scrubber drag** — explored and rejected for now (deviations.md §20, `scrubber-nonlinear-research.md`). Two approaches tried: (A) power-curve position mapping — thumb snaps back on release; (B) velocity-based delta accumulation — position races ahead of visual. Both failed. Current linear drag is correct for seeking; wheel/trackpad handles fine browsing. **Revisit when:** scrubber is fully bug-free AND E2E test coverage is comprehensive enough to catch any regression. The research doc (`scrubber-nonlinear-research.md`) contains full prior art survey, curve analysis, and implementation notes — don't re-derive from scratch.
- [ ] **Distribution-aware scrubber mapping** — different from pure-math nonlinear. Uses ES histogram bucket counts to warp the track so dense date regions get more pixels. Requires histogram aggregation data. Phase 6 work, independent of nonlinear drag.
- [ ] **Quicklook** — hold Cmd/Ctrl to show a large imgproxy preview over the hovered image in grid/table. Moving mouse (still holding) swaps to the hovered image. Release dismisses. Purely transient — no navigation, no state change. ~100-150 lines. Main concern is imgproxy latency (~456ms median); progressive JPEG XL may help long-term. Independent of panels, navigation paradigm, or any other feature.
- [ ] `is:GNM-owned` filter with real org config from Grid (currently recognized in CQL but not filtering)
- [ ] `GridApiDataSource` (Phase 3 — replaces ES adapter, adds auth, uses Grid media-api HATEOAS links)
- [ ] Row grouping (e.g. group by credit, source, date) — TanStack Table has built-in `getGroupedRowModel()` + `getExpandedRowModel()` with aggregation functions. Works client-side on loaded rows; for 9M-scale grouping would need server-side via ES composite/terms aggs with `manualGrouping: true`. Consider alongside facet filters.
- [ ] Discovery features beyond faceted filters — date histograms, geographic clustering, credit/source network visualisation, usage pattern analysis, visual similarity (knn on existing embedding vectors), trending/significant_terms. All read-only ES-native. Some depend on mapping enhancements (`mapping-enhancements.md`). See `frontend-philosophy.md` → "Discovery: Beyond Search".

## Tech Stack

| Concern | Choice |
|---|---|
| UI | React 19 with TypeScript |
| Table | TanStack Table v8 (headless, virtualised, column reorder/resize) |
| Virtual Scroll | TanStack Virtual |
| State | Zustand (lightweight, URL sync middleware) |
| Routing | TanStack Router (search params validated via Zod, pairs with TanStack ecosystem) |
| Styling | Tailwind CSS 4 (utility-first, no runtime overhead, dark mode, `@layer components` for shared classes) |
| Build | Vite 8 (Rolldown engine) |
| Data Layer | Abstracted `ImageDataSource` interface — currently `ElasticsearchDataSource` (local or remote via tunnel). `GridApiDataSource` deferred until auth/writes needed |
| Validation | Zod 4 |
| Testing | Vitest (co-located `*.test.ts` unit/integration tests) + Playwright (E2E in `e2e/`, `run-e2e.sh` orchestrates Docker ES + data + cleanup) |
| Dates | date-fns |

## Key Architecture Decisions

1. **Separate ES instance on port 9220** — kupua's `docker-compose.yml` is independent of Grid's. Container `kupua-elasticsearch`, cluster `kupua`, volume `kupua-es-data`. Grid's `dev/script/start.sh` won't affect it.

2. **Data Access Layer (DAL)** — TypeScript interface `ImageDataSource` with methods: `search()`, `count()`, `getById()`, `getAggregation()`, `searchAfter()`, `openPit()`, `closePit()`, `countBefore()`, `estimateSortValue()`, `findKeywordSortValue()`, `getKeywordDistribution()`. Currently implemented by `ElasticsearchDataSource` (direct ES access via ~2,550 lines across 5 files: `es-adapter.ts`, `cql.ts`, `field-registry.ts`, `types.ts`, `es-config.ts`). `searchAfter()` is now the primary pagination method — used by `search()`, `extendForward`/`extendBackward`, and `seek()` in the store. Supports `reverse`, `noSource`, and `missingFirst` flags. **PIT 404/410 fallback:** when a PIT-based `searchAfter` fails with 404 or 410 (stale PIT closed by a concurrent search), retries the same request without PIT against the index directly — prevents seek failures from PIT race conditions. `missingFirst` overrides `missing: "_first"` on the primary sort field — needed for reverse-seek-to-end on keyword fields where null-value docs sort last in both asc and desc (ES default). Deep seek uses two strategies: (A) for numeric/date fields, `estimateSortValue()` uses ES percentiles aggregation to estimate the sort value at position N; (B) for keyword fields (credit, source, etc.), `findKeywordSortValue()` uses composite aggregation with `BUCKET_SIZE=10000` (configurable via `VITE_KEYWORD_SEEK_BUCKET_SIZE`) to walk unique values accumulating doc_counts until the target position is reached. **Binary search refinement:** when `search_after` lands at a keyword bucket start far from the target (drift > PAGE_SIZE), a binary search on the `id` tiebreaker field refines the cursor using `countBefore` queries (~11 iterations of ~500B `_count` requests, ~4s total vs 46s for the old brute-force skip loop that transferred ~50MB of sort values). Hex interpolation between `0` and `0xffffffffffff` exploits the uniform distribution of SHA-1 image IDs. Benefits all keyword sorts (Credit, Source, Category, Image Type, MIME Type, Uploaded By). When composite exhausts (null/missing-value tail), returns `lastKeywordValue` instead of null. Has an 8s time cap. Structured telemetry logging enables E2E tests to assert algorithmic efficiency. When keyword seek lands far from target near the end, a reverse `search_after` with `missingFirst: true` fetches the true last page; `actualOffset = total - hits.length` (skipping `countBefore` which can't handle null sort values). Phase 3+ architecture: **dual-path** — keep direct ES for reads (fast, supports custom aggregations), add `GridApiDataSource` for writes (metadata editing, crops, leases via media-api). Full migration surface analysis in deviations.md §16.

3. **Scripts in `kupua/scripts/`** (not `kupua/dev/scripts/`) — kupua is a self-contained app; no need for Grid's layered `dev/` hierarchy.

4. **sample-data.ndjson must NOT be committed to git** — too large (115MB). Kept locally or in S3.

5. **All views are one page** — table, grid, side-by-side, detail are density levels of the same ordered list. URL reflects full state. Browser back/forward restores position.

6. **Routes match kahuna exactly** — so existing bookmarks and shared URLs work when kupua replaces kahuna:
   - `/search?query=...` — main search route with all filter params
   - `/images/:imageId?crop=...&cropType=...`
   - `/images/:imageId/crop?cropType=...`
   - `/upload`
   - `/` → redirects to `/search?nonFree=true`

   **Complete `/search` URL params** (all optional):
   | Param | Type | Example | Notes |
   |---|---|---|---|
   | `query` | string | `credit:"Getty" -by:"Foo"` | Free-text / CQL query |
   | `ids` | string | `abc123,def456` | Comma-separated image IDs (from Share button) |
   | `since` | ISO date | `2026-03-19T10:54:29.221Z` | Upload time lower bound |
   | `until` | ISO date | | Upload time upper bound |
   | `nonFree` | `true` | `true` | Show paid images (omit = free only) |
   | `payType` | string | `free\|maybe-free\|pay\|all` | Pay type filter |
   | `uploadedBy` | string | `john.doe@guardian.co.uk` | Filter by uploader |
   | `orderBy` | string | `-taken`, `-uploadTime`, `oldest` | Sort order |
   | `useAISearch` | `true` | | Enable semantic/AI search |
   | `dateField` | string | | Which date field for range |
   | `takenSince` | ISO date | | Date taken lower bound |
   | `takenUntil` | ISO date | | Date taken upper bound |
   | `modifiedSince` | ISO date | | Last modified lower bound |
   | `modifiedUntil` | ISO date | | Last modified upper bound |
   | `hasRightsAcquired` | `true\|false` | | Syndication rights filter |
   | `hasCrops` | `true\|false` | | Has exports/crops |
   | `syndicationStatus` | string | | Syndication status filter |
   | `persisted` | `true\|false` | | Is archived or has usages |
   | `expandPinboard` | string | | Pinboard integration (passthrough) |
   | `pinboardId` | string | | Pinboard integration (passthrough) |
   | `pinboardItemId` | string | | Pinboard integration (passthrough) |
   | `image` | string | `abc123` | Image detail overlay (display-only, not synced to search store) |
   | `density` | `table` | | View density — absent=grid (default), `table`=data table (display-only) |

   **Key mapping**: `nonFree=true` → API `free=undefined`; `hasCrops` → API `hasExports`

   Selections are NOT in URL (matching kahuna — only `ids=` from Share button).

7. **Column config in localStorage** (not URL) — visibility and widths are persisted per-client via `useColumnStore` with zustand/persist. Key: `kupua-column-config`. Column IDs use TanStack Table's format (dots→underscores). The store also holds session-only `preDoubleClickWidths` (excluded from localStorage persistence via `partialize`) for the double-click fit/restore toggle. Order and sorting will be added when needed.

8. **Scrollbar strategy** — Now uses a **windowed buffer architecture**: fixed-capacity buffer (max 1000 entries) with `bufferOffset` mapping buffer[0] to a global position. `search_after` with PIT provides cursor-based pagination. `extendForward`/`extendBackward` append/prepend pages as the viewport approaches buffer edges; eviction keeps memory bounded. `seek()` repositions the buffer anywhere in the result set: shallow offsets (<10k) use `from/size`, deep offsets (≥10k) use **percentile estimation** on the primary sort field + `search_after` + `countBefore` for exact offset — no depth limit, ~20-70ms regardless of position (vs 500-2500ms for `from/size` at 50-100k). The `estimateSortValue()` DAL method runs a single ES percentiles aggregation. **Native scrollbar hidden** (`hide-scrollbar` CSS class) — the custom **Scrubber** (`Scrubber.tsx`) is the sole visible scrollbar. Always rendered (even for small result sets). Two modes: **scroll mode** (total ≤ buffer, all data loaded — scrubber scrolls the content container directly) and **seek mode** (total > buffer — scrubber triggers seek to reposition the buffer). Vertical track on the right edge, proportional thumb, click-to-seek/scroll, the scrubber doesn't debounce during drag; it fires one seek on pointer-up, position tooltip on active interaction. Thumb position uses direct DOM manipulation via ref for 60fps tracking during drag. `pendingSeekPosRef` (a plain ref, not state) holds the user's intended position during async seek — blocks the DOM sync effect from snapping the thumb back until the seek completes; cleared when `currentPosition` changes, `loading` transitions true→false, or `total` changes. Track height measured via **callback ref** + ResizeObserver (not `useEffect([], [])`) because the component returns null when `total ≤ 0` — a mount-time effect would miss the DOM element. Seek abort: aborted seeks do NOT set `loading: false` (the newer seek/search owns loading state); `countBefore` accepts an abort signal; `signal.aborted` guard before `countBefore` call. Seek cooldown (500ms, set synchronously at seek start, NOT refreshed at data arrival) suppresses extend cascades during the fetch. Views dispatch a deferred scroll event 600ms after seek lands to trigger extends once cooldown expires. Logo click explicitly calls `store.search()` to reset the buffer even when URL params haven't changed. `imagePositions: Map<imageId, globalIndex>` maintained incrementally, cleaned on eviction. PIT opened on non-local ES for consistent pagination; local ES skips PIT (stable 10k dataset). Old `loadMore`/`loadRange` kept as deprecated aliases during migration. Previous approach (sparse array + `from/size` + `frozenUntil`) replaced. Kahuna analysis in `kahuna-scroll-analysis.md`. Full design in `search-after-plan.md`.

9. **Local dev domain** — currently `localhost:3000`. Future: add `kupua.media.local.dev-gutools.co.uk` to `dev/nginx-mappings.yml` pointing to port 3000. Trivial change when needed.

10. **URL is single source of truth for search state** — user interactions update the URL via `useUpdateSearchParams`, which triggers `useUrlSearchSync` to push params to the Zustand store and fire a search. When clearing params (e.g. clearing the search box), all URL-managed keys are explicitly reset to `undefined` before applying URL values, so removed params don't survive in the store via spread. `resetSearchSync()` clears the dedup state so a "reset everything" action (logo click) always triggers a fresh search, even when the URL params haven't actually changed (e.g. logo clicked while already at `?nonFree=true`).

11. **Sort system** — `orderBy` URL param supports comma-separated values for multi-sort (e.g. `-uploadTime,-metadata.credit`). The ES adapter's `buildSortClause` expands aliases per-part (e.g. `taken` → `metadata.dateTaken,-uploadTime`). Column headers, sort dropdown, and URL all use the same sort keys. Secondary sort is managed via shift-click.

12. **TanStack Table column ID gotcha** — when using dot-path accessors (e.g. `"metadata.credit"`), TanStack Table auto-generates column IDs with dots replaced by underscores (`"metadata_credit"`). Any map keyed by column ID must use underscores. This bit us once already.

13. **Custom URL parse/stringify (not `parseSearchWith`)** — TanStack Router's built-in `parseSearchWith` delegates to `qss.decode` which calls `toValue()`, converting `"true"` → boolean `true` and `"123"` → number `123`. Our Zod schema expects all values as strings, so booleans/numbers silently fall through `.catch(undefined)` and are lost. We use fully custom `plainParseSearch`/`plainStringifySearch` based on `URLSearchParams` directly, keeping all values as plain strings. This also avoids `JSON.stringify` wrapping strings in quotes (`%22true%22`). Stale quoted values from old bookmarks are stripped.

14. **CQL chips via `@guardian/cql` Web Component** — The `<cql-input>` custom element (from `@guardian/cql`) handles all chip rendering, editing, keyboard navigation, and typeahead. It is registered once globally in `CqlSearchInput.tsx`. The typeahead fields are built from the DAL via `typeahead-fields.ts` with resolvers that query local ES aggregations on keyword fields. When the DAL switches to the Grid API, the resolvers will automatically use live API endpoints with no UI changes needed.

15. **Mock config for Phase 1** — `kupua/exploration/mock/grid-config.conf` is a sanitised copy of PROD Grid config. `src/lib/grid-config.ts` parses it for field aliases and category lists. This avoids hardcoding and will be replaced by live config fetching in Phase 3.

16. **Start script** — `kupua/scripts/start.sh` is the single entry point for local development. It orchestrates ES startup, data loading, npm install, and Vite dev server. Flags allow skipping steps for faster restarts. Validates prerequisites before starting: Node version (Vite 8 requires `^20.19.0 || >=22.12.0`), Docker running, port availability (3000 for Vite, 9220 for ES — uses `lsof -sTCP:LISTEN` to avoid false positives from client connections).

17. **`@/*` path alias** — `@/components/Foo` resolves to `src/components/Foo`. Configured in both `tsconfig.json` (`paths`) and `vite.config.ts` (`resolve.alias`). All imports use this alias.

18. **`App.tsx` deleted** — was dead code after layout moved to `routes/__root.tsx`. Removed during codebase audit.

19. **Font standardisation** — `--font-sans` is overridden in `@theme` to `'Open Sans', ui-sans-serif, system-ui, sans-serif`. This is the Tailwind 4 convention: all elements inherit from `--font-sans` via the base layer, so new elements get Open Sans automatically. Three-tier font scale: `text-sm` (14px, Tailwind default) for UI chrome, `text-xs` (13px via `--text-xs: 0.8125rem` override) for data content, `text-2xs` (12px via custom `--text-2xs: 0.75rem` token) for dimmed secondary text like grid cell dates. 13px for CQL input (Web Component theme). Prefer standardised sizes over arbitrary one-off values (`text-[11px]` etc.) — if a new size is genuinely needed, add a theme token rather than scattering magic numbers.

20. **Shared popup styling via CSS component classes** — `popup-menu` and `popup-item` are defined in `index.css` `@layer components`. All dropdowns and context menus use these classes for consistent appearance (`bg-grid-panel`, `border-grid-border`, `rounded shadow-lg`, hover highlight). New menus inherit the look automatically.

21. **Auto-reveal hidden columns on sort** — when the user sorts by a column that's currently hidden, the column is automatically shown via `toggleVisibility()` (same store action as the context menu), so it persists as a normal user choice. The user can hide it again anytime. Generic — works for any sortable column, not just specific ones.

22. **Fullscreen survives between images** — the Fullscreen API exits fullscreen when the fullscreened element is removed from the DOM. Image detail is rendered as an overlay within the search route (not a separate route), and React reconciles the same `ImageDetail` component when only the `image` prop changes, so the fullscreened `<div ref>` stays in the DOM and fullscreen persists. This is the architectural reason why image detail uses a prop — not a route param. `Escape` only exits fullscreen (never navigates or closes image detail).

23. **Image detail is an overlay, not a separate route** — the image detail view renders within the search route when `image` is present in URL search params (`?image=abc123&nonFree=true&query=...`). The search page stays mounted and fully laid out (`opacity-0 pointer-events-none`, NOT `display:none` — because `display:none` resets `scrollTop` to 0). Scroll position, virtualizer state, and search context are all preserved. Browser back removes `image` from params — the table reappears at the exact scroll position with no re-search. `image` is a display-only URL param: it's excluded from store sync and ES queries via `URL_DISPLAY_KEYS`. Prev/next replaces `image` (so back always returns to the table, not through every viewed image). If the user navigated to a different image via prev/next, the focused row is centered in the viewport on return. `/images/:imageId` redirects to `/search?image=...&nonFree=true` for backward compat. URL param ordering controlled by `URL_PARAM_PRIORITY` — `image` appears first, matching Grid URL style.

24. **"Never Lost" context preservation** — Focus, selection, edit state, and scroll position survive every density/view change (table → grid → single image and back). Views are density levels of the same list, not separate pages. When search context changes and the focused item leaves the result set, kupua snaps focus to the **most adjacent surviving item** from the previous result set (nearest neighbour scan, alternating forward/backward), rather than resetting to the top. Selections that survive the new results are kept; missing ones are silently dropped. Edit state on a displaced image is preserved with a subtle "not in current results" indicator. Full algorithm and rationale in `frontend-philosophy.md` → "Context is Sacred".

25. **Actions written once, context-adaptive** — Action buttons (Crop, Delete, Download, Archive, Share, Add to Collection, Set Rights, etc.) are each implemented as a single component that accepts an `images` array. An `ActionBar` component derives `targetImages` from current state (focused image, selection, or current detail image) and renders all actions. Labels, enabled state, and confirmation dialogs adapt to the image count — but core logic is identical regardless of which view density the user is in. Kahuna already uses `images` arrays for its action components; kupua formalises this into one `ActionBar` mounted in a stable toolbar position, never duplicated per view. See `frontend-philosophy.md` → "Actions are Written Once".

26. **Field Definition Registry** — `src/lib/field-registry.ts` is the single source of truth for every image field kupua can display, search, sort, or aggregate. Each `FieldDefinition` captures: identity (id, label, group), data access (accessor, rawValue), search (cqlKey, esSearchPath), sort (sortKey, descByDefault), display (defaultWidth, defaultHidden, formatter, cellRenderer), detail panel hints (detailLayout, detailHidden, detailGroup, detailClickable), and type metadata (fieldType, isList, isComposite, editable, aggregatable). Config-driven alias fields from `grid-config.ts` are spliced in after Byline title (not appended). **Canonical ordering**: the array order in `HARDCODED_FIELDS` is the single source of truth for field ordering across all surfaces — table columns, column chooser, facet filters, sort dropdown, and details panel all derive from it. The sort dropdown promotes dates to the top in a fixed order (Uploaded → Taken → Modified), then follows registry order for the rest. The details panel uses `detailGroup` overrides to control section breaks independently of the `group` used for sort-dropdown inclusion. Consumers (`ImageTable`, `ImageMetadata`, `SearchFilters.Sort`, `FacetFilters`, `column-store`) import derived maps and never hardcode field knowledge. **New fields added**: Keywords (list, default visible), File size (integer, detail-only), Image ID (keyword, detail-only). **Coupling note:** `fieldType` and `aggregatable` restate the ES mapping — if the mapping changes (e.g. mapping-enhancements.md §2a), these must be updated.

27. **Panels — always-in-flow, no overlay mode** — Two panel zones (left, right) flanking the main content in a flex row. Panels are either visible (in the layout flow, pushing content) or hidden. No kahuna-style overlay/locked distinction, no auto-hide-on-scroll. Resizable via drag handles, width persisted to localStorage. Accordion sections within each panel. Left: Filters + Collections (Phase 4). Right: shared Metadata component (same as image detail). Keyboard: `[` left, `]` right. Panel state in localStorage (not URL — it's user preference, not search context). Facet aggregations are lazy: fetched only when the Filters section is expanded, debounced separately (500ms), cached per query, with a circuit breaker if response exceeds 2s. Section open/closed state persisted to localStorage — most users keep Filters collapsed (no ES agg load); power users who expand Filters self-select into the agg cost. Full plan: `panels-plan.md`. Deviation from kahuna: see `deviations.md` when implemented.

28. **Grid view scroll anchoring on width change** — When `ImageGrid.tsx`'s container width changes (from any cause: panel toggle, panel resize, browser window resize) and the column count changes, the focused (or viewport-centre) image's viewport ratio is captured before the change and restored in a `useLayoutEffect` after React re-renders. No visible jump. Table view doesn't need this — its vertical layout is width-independent. This is a generic `ResizeObserver` improvement, not panel-specific. Same algorithm concept as the density-focus bridge (in `useScrollEffects`) but within the same component lifecycle rather than across unmount→remount.

29. **CSS containment on scroll containers** — `hide-scrollbar` class includes `contain: strict` (= size + layout + paint + style). Critical for Firefox scroll performance. `hide-scrollbar-y` (table view) also uses `contain: strict` with `scrollbar-width: none` + `::-webkit-scrollbar { display: none }` to hide **all** native scrollbars. Modern Chrome (v121+) supports `scrollbar-width`, which disables `::-webkit-scrollbar` pseudo-elements — making CSS-only per-axis hiding impossible. The table's horizontal scrollbar is a **proxy div** at the bottom of the table that syncs `scrollLeft` bidirectionally with the main scroll container via event listeners and tracks content width via `ResizeObserver`. The vertical scrollbar is replaced by the Scrubber component. This approach works identically in Chrome, Firefox, and Safari.

## Project Structure

```
kupua/
  docker-compose.yml          # Standalone ES on port 9220
  index.html                   # SPA entry HTML
  package.json                 # Dependencies and scripts
  vite.config.ts               # Vite config with /es proxy to ES:9220, @ alias
  tsconfig.json                # TypeScript config, @ path alias
  .gitignore                   # Ignores sample-data.ndjson, node_modules, dist
  AGENTS.md                    # This file — agent context
  README.md                    # Setup instructions, project structure
  public/
    fonts/                     # Open Sans woff2 files (copied from kahuna) + OFL license
    images/
      grid-logo.svg            # Grid 3×3 logo
      grid-favicon.svg         # Grid favicon
  exploration/
    mock/
      mapping.json             # ES mapping from CODE
      sample-data.ndjson       # 10k docs sample data (NOT in git)
      grid-config.conf         # Sanitised copy of PROD Grid config (aliases, categories)
    docs/
      migration-plan.md        # Full phased migration plan
      frontend-philosophy.md   # UX/UI philosophy: density continuum, interaction patterns, comparisons
      grid-view-plan.md        # Grid view plan: kahuna analysis, architecture stress tests, design decisions
      kahuna-scroll-analysis.md # Deep read of kahuna's gu-lazy-table: sparse array, from/size, 100k cap. Lessons for kupua.
      deviations.md            # Intentional differences from Grid/kahuna + library convention bends
      performance-analysis.md  # Performance: 36 findings, action plan, imgproxy bench, scrubber prereqs, Lighthouse audit
      infra-safeguards.md            # Elasticsearch + S3 safety documentation
      kupua-audit-assessment.md # Codebase audit: architecture grades, cleanup opportunities, documentation accuracy
      s3-proxy.md              # S3 thumbnail proxy documentation (temporary)
      imgproxy-research.md     # Research: eelpie fork analysis + AVIF encoding deep-dive (library versions, tune chain, tune=iq blockers)
      mapping-enhancements.md  # Proposed ES mapping improvements
      panels-plan.md           # Panels design + implementation plan: layout, facet filters, scroll anchoring, kahuna reference
      search-after-plan.md     # search_after + windowed scroll: analysis, architecture, 13-step implementation plan (~25-35h)
      scrubber-nonlinear-research.md # Non-linear drag mapping: prior art, curve analysis, gotchas, recommendation (power curve k=2)
      rendering-perf-plan.md   # Systematic rendering perf audit: baselines (1400px/Retina/4K), issue taxonomy (A–F), work plan, quantitative gates
      rendering-perf-session-plan.md # Succinct handoff for next agent: Retina analysis, prioritised steps, files to read
      traversal-perf-investigation.md # Image traversal perf: Era 2→3 regression, 4-phase experiment, direction-aware pipeline fix, throttle analysis
      copilot-instructions-copy-for-humans.md # Human-readable copy of directives (identical to .github/copilot-instructions.md)
      buffer-corruption-fix.md   # Complete analysis of the buffer corruption bug: root cause, 5-layer fix, consequences, testing strategy
      home-logo-bug-research.md  # Research log for the Home logo bug — hypotheses tested, causal chain, resolution
  scripts:
    start.sh                   # One-command startup (ES + data + deps + S3 proxy + imgproxy + dev server)
    run-e2e.sh                 # E2E test orchestration (Docker ES + data check + stale-process cleanup + Playwright)
    run-smoke.mjs              # Interactive runner for manual smoke tests. Lists tests, prompts for selection, runs headed. MANUAL ONLY.
    run-perf-smoke.mjs         # Thin wrapper → e2e-perf/run-audit.mjs. MANUAL ONLY.
    bench-formats.sh           # imgproxy format benchmark: WebP vs AVIF vs JXL vs JPEG (progressive). Auto-discovers images from ES.
    load-sample-data.sh        # Index creation + bulk load
    s3-proxy.mjs               # Local S3 thumbnail proxy (uses dev AWS creds, temporary)
  src/                         # ~16,300 lines total
    main.tsx                   # React entry point — mounts RouterProvider
    router.ts                  # TanStack Router setup — custom plain-string URL serialisation
    index.css                  # Tailwind CSS import + Open Sans font + Grid colour theme + shared component classes (popup-menu, popup-item)
    constants/
      layout.ts                # Shared pixel constants: TABLE_ROW_HEIGHT (32), TABLE_HEADER_HEIGHT (45), GRID_ROW_HEIGHT (303), GRID_MIN_CELL_WIDTH (280), GRID_CELL_GAP (8)
    routes/
      __root.tsx               # Root route — minimal shell (bg + flex column), no header
      index.tsx                # Index route — redirects `/` → `/search?nonFree=true`
      search.tsx               # Search route — validates URL search params via Zod, renders search page + ImageDetail overlay when image param present
      image.tsx                # Image redirect — `/images/$imageId` → `/search?image=...&nonFree=true`
    lib/
      cql.ts                   # CQL parser + CQL→ES query translator (451 lines)
      field-registry.ts        # Field Definition Registry — single source of truth for all image fields (644 lines)
      field-registry.test.ts   # Registry tests: derived maps match old hardcoded values, accessors, formatters (34 tests)
      grid-config.ts           # Mock Grid config parser (field aliases, org-owned categories)
      lazy-typeahead.ts        # LazyTypeahead — deferred value resolution for CQL typeahead (212 lines)
      search-params-schema.ts  # Zod schema for URL search params — single source of truth
      scroll-container-ref.ts  # Module-level ref for the active scroll container — registerScrollContainer(el) called by useScrollEffects on mount/unmount; getScrollContainer() used by Scrubber + resetScrollAndFocusSearch.
      keyboard-shortcuts.ts    # Centralised keyboard shortcut registry — single document listener, Alt+key in editable fields, stack semantics. shortcutTooltip helper.
      sort-context.ts          # Sort-context label utility — maps orderBy + Image → display label (date/keyword) for scrubber tooltip. Adaptive date granularity (total span + local density → d Mon yyyy / Mon yyyy / d Mon, H:mm). Keyword distribution binary search (lookupKeywordDistribution), ES field resolver (resolveKeywordSortInfo). Date interpolation via estimateDateAtPosition helper. **computeTrackTicks** generates density-correct tick marks from ES histogram buckets — adaptive span-based labelling: short spans (<15 years) give every January a year label + major tick type; long spans (≥15 years) use decade/half-decade hierarchy to prevent overcrowding.
      image-urls.ts            # Image URL builders — thumbnails via S3 proxy, full images via imgproxy
      image-offset-cache.ts    # sessionStorage cache for image position in search results — stores offset + sort cursor (SortValues) + search fingerprint. On reload, `restoreAroundCursor` uses the cursor for precise `search_after` restoration at any depth. `extractSortValues(image, orderBy)` builds cursor from in-memory image fields (zero ES calls). Backward-compatible with old cache entries (missing cursor falls back to approximate seek).
      image-offset-cache.test.ts # Unit tests: extractSortValues (default/width/credit/sparse sorts), buildSearchKey (determinism, stripping), sessionStorage round-trip (cursor, backward compat, malformed data). 15 tests.
      typeahead-fields.ts      # Builds typeahead field definitions for CQL input from DAL (251 lines)
    dal/
      types.ts                 # ImageDataSource interface + SearchParams + SortValues + BufferEntry + SearchAfterResult + AggregationRequest/AggregationsResult + estimateSortValue types (~245 lines)
      es-adapter.ts            # Elasticsearch implementation (~1020 lines — sort aliases, CQL translation, free-to-use filter, batched aggregations, search_after, PIT lifecycle, countBefore, estimateSortValue, tiebreaker sort)
      es-adapter.test.ts       # Unit tests for buildSortClause tiebreaker behaviour (10 tests)
      mock-data-source.ts      # MockDataSource — deterministic mock for testing, generates img-{index} with linear dates (~210 lines)
      es-config.ts             # ES connection config — URL, index, source excludes, allowed paths (_search, _count, _cat/aliases, _pit), local flag
      index.ts                 # Barrel export
    components/
      CqlSearchInput.tsx       # React wrapper around @guardian/cql <cql-input> Web Component (227 lines)
      DateFilter.tsx           # Date range filter dropdown (486 lines)
      ErrorBoundary.tsx        # React error boundary — catches render crashes, shows recovery UI
      ErrorBoundary.test.tsx   # 2 tests: renders children, catches errors
      ImageDetail.tsx          # Single-image view: overlay within search route, fullscreen (black, no UI), prev/next navigation. Uses shared ImageMetadata for sidebar.
      ImageMetadata.tsx        # Registry-driven metadata display (~325 lines) — iterates DETAIL_PANEL_FIELDS, groups into sections on detailGroup change, respects detailLayout/detailClickable/detailHidden. Handles composites (location sub-links), lists (pills), formatted values, Image ID (monospace). Used by ImageDetail sidebar and right side panel.
      SearchPill.tsx           # Shared pill component for list field values. SearchPill (direct callback, metadata panel) + DataSearchPill (data-attr delegation, table cells). Click-to-search with Shift/Alt modifiers.
      StatusBar.tsx            # Status bar: count + new images ticker + response time + density toggle (table/grid)
      SearchBar.tsx            # Single-row toolbar: logo + CQL search input + clear button (123 lines)
      SearchFilters.tsx        # Compound component: FilterControls (free-to-use, dates) + SortControls (custom dropdown + direction toggle) (185 lines)
      ColumnContextMenu.tsx    # Column header context menu — visibility toggles, fit-to-data (178 lines). Imperative ref handle, self-contained positioning.
      FacetFilters.tsx          # Facet filter panel content (~275 lines) — aggregatable fields, value lists with compact counts, click adds/removes CQL chips, Alt+click excludes, "Show more" per field (separate single-field 100-bucket request), scroll-anchored "Show fewer"
      PanelLayout.tsx          # Panel system: flex row of [left?] [main] [right?], resize handles (double-click to close), keyboard shortcuts [`/`] (Alt+key in editable fields via keyboard-shortcuts.ts), AccordionSection component (~220 lines)
      ImageTable.tsx           # TanStack Table + Virtual, all table features (~1260 lines — column defs generated from field-registry.ts). Uses useDataWindow for data/pagination.
      ImageGrid.tsx            # Thumbnail grid density (~520 lines). Responsive columns via ResizeObserver, row-based TanStack Virtual, S3 thumbnails, rich tooltips, grid-geometry keyboard nav. Scroll anchoring on column count change. Same useDataWindow as table.
      Scrubber.tsx             # Global position scrubber — vertical track on right edge of content area. Proportional thumb, click-to-seek, drag-to-seek (deferred to pointer up), hover-preview tooltip. Sort-aware tooltip with adaptive date granularity + keyword context. Always-rendered (opacity-controlled, not conditionally mounted) — fade in/out via CSS transition. Auto-hide after 1.5s inactivity. Hidden when total ≤ 0. Callback ref for ResizeObserver + wheel event. pendingSeekPosRef for async seek position hold. Scroll-mode sync re-attaches via MutationObserver on density switch. (~1010 lines)
    stores/
      search-store.ts          # Zustand store — windowed buffer (search, extendForward/Backward via reverse search_after, seek, eviction, PIT lifecycle), search params, imagePositions, sort-around-focus (async find-and-seek after sort change via _findAndFocusImage), restoreAroundCursor (image-detail reload restore). Both use shared _loadBufferAroundImage() helper for bidirectional search_after buffer assembly. Aggregations + fetchAggregations with cache/debounce/circuit-breaker, expandedAggs + fetchExpandedAgg for per-field "show more". View components access data via useDataWindow hook, not directly. (~1810 lines)
      search-store.test.ts     # Integration tests with MockDataSource (34 tests): search, seek, extend, eviction, imagePositions consistency, sort-around-focus lifecycle, density-switch ratio, sort-context label interpolation
      column-store.ts          # Zustand store + localStorage persist (column visibility, widths, pre-double-click widths) (~109 lines)
      panel-store.ts           # Zustand store + localStorage persist (panel visibility, widths, section open/closed) (~140 lines)
    types/
      image.ts                 # Image document types from ES mapping
  e2e/
    global-setup.ts            # Playwright global setup — safety gate (refuses to run against real ES via Vite proxy >50k docs), verifies ES health + sample data before tests run (fail-fast)
    helpers.ts                 # Playwright test fixtures + KupuaHelpers class (shared by e2e/ and e2e-perf/). gotoPerfStable() for corpus pinning. Scrubber, store, sort, density, focus helpers.
    scrubber.spec.ts           # E2E tests: scrubber seek/drag, scroll position after seek, density switch preservation, sort change, sort-around-focus, full workflows
    manual-smoke-test.spec.ts  # Smoke tests against real ES (TEST cluster). MANUAL ONLY — agent must never run. Auto-skips on local ES (total < 100k). Run via: node scripts/run-smoke.mjs
    tsconfig.json              # TypeScript config for e2e directory (ES2022, bundler resolution, @types/node)
  e2e-perf/
    perf.spec.ts               # Rendering performance smoke tests (16 tests P1–P16). Structured emitMetric() output. Corpus pinned via PERF_STABLE_UNTIL. MANUAL ONLY via: node e2e-perf/run-audit.mjs
    experiments.spec.ts        # Tuning experiments — agent-driven A/B testing (E1–E6). Wheel scroll tiers (slow/normal/fast), smooth autoscroll tiers (crawl→fast, rAF-driven continuous scroll simulating middle-click autoscroll), traversal speed tiers for image detail/fullscreen. Corpus pinned via STABLE_UNTIL. Per-image render timing for E4/E5. Probe self-test diagnostics. Safety bounds in header + README. Viewport matches perf tests (1987×1110, DPR 1.25).
    playwright.perf.config.ts  # Playwright config for perf tests (testDir: e2e-perf, JSON reporter, list reporter, Retina viewport)
    run-audit.mjs              # Audit harness: runs perf.spec.ts, reads metrics, diffs vs prior run, writes audit-log.json + audit-log.md
    tsconfig.json              # TypeScript config for e2e-perf (ES2022, bundler resolution, @types/node)
    results/
      audit-log.json           # Machine-readable: every audit run's metrics (keyed by label + git SHA)
      audit-log.md             # Human-readable: diff tables per run
      experiments/             # Experiment result JSON files (exp-*.json, gitignored) + README + experiments-log.md
      .gitkeep
    hooks/
      useDataWindow.ts       # Data window hook — shared interface between search store and view components (table, grid, detail). Buffer-aware: exposes bufferOffset, reportVisibleRange (triggers extend at edges), seek, getImage (buffer-local), findImageIndex (global→local translation). Exports useVisibleRange() via useSyncExternalStore for Scrubber position tracking. Virtualizer count = buffer length. (~215 lines).
      useListNavigation.ts   # Shared keyboard navigation hook — moveFocus, pageFocus, home, end. Parameterised by geometry (columnsPerRow, flatIndexToRow). Used by ImageTable and ImageGrid (327 lines).
      useUrlSearchSync.ts      # URL↔store sync: useUrlSearchSync (URL→store→search) + useUpdateSearchParams (component→URL)
      useFullscreen.ts         # Fullscreen API wrapper — toggle/enter/exit fullscreen on a stable DOM element
      useKeyboardShortcut.ts   # React hook wrapping keyboard-shortcuts.ts — auto-register on mount, unregister on unmount, ref-stable action

