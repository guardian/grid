# A5 Perceived-Performance Migration Ledger

**Status:** A5 resolved, 10 September 2026  
**Scope:** all 22 persisted perceived-performance IDs  
**Goal:** migrate each row from temporal adjacency to explicit interaction identity, fixed scenario context, and an honest user-visible or native completion boundary

## How To Use This Ledger

Update this file after every accepted scenario slice. A row is `Complete` only
when all of the following are true:

1. The trigger is fixed and fails rather than selecting a substitute.
2. Exactly one `interactionId` owns every required phase.
3. The row distinguishes store publication from browser-visible or native
   completion where those differ.
4. Scenario revision, settled total/regime, and sanitized route categories are
   persisted and stable across repetitions.
5. Focused tests, the full relevant unit surface, and required browser surfaces
   pass. Historical rows from an older revision are not compared as one series.
6. Dashboard entries identify verified app mode (`direct-es` or `media-api`),
   and migrated rows retain successful operation route categories. Unknown
   historical mode is labeled `unknown`, never guessed.

Status values:

| Status | Meaning |
|---|---|
| `Complete` | Contract implemented and browser-verified |
| `Ready` | Existing scenario is sufficiently fixed; next migration can implement its named oracle |
| `Blocked` | Scenario identity or setup must be repaired before boundary migration |
| `Diagnostic` | Not a user action; keep separate from user-action thresholds or remove |

## Migration Families

| Family | IDs | Shared protocol | Constraint |
|---|---|---|---|
| Focused sort | PP3, PP4 | `sort-around-focus` interaction ID; store-ready; focused-cell first-visible and two-frame stable geometry | Exact sort control and focus context must be fixed |
| Unfocused search | PP2, PP5, PP8, PP9, JA1, JA3, JB1, JB2, JB3 | Search generation/context correlation; target-context visible content; no error/status; stable view | Trigger/query/control must be exact; do not borrow downstream search phases |
| Density | PP6, PP6b, PP6c | Density interaction ID; target container/view; two painted stable frames | Depth and anchor setup must be deterministic |
| Scrubber | PP7, PP7b, PP7c, JB4 | App-owned regime; interaction ID; achieved ratio; store-ready where networked; visible content and stable thumb/content | Buffer, indexed, and seek are distinct contracts |
| Detail/fullscreen | JA2, JB5 | Surface-specific native/DOM state; decoded target image where useful; destination placement | FullscreenPreview and ImageDetail fullscreen must remain distinct |
| Reset | PP1 | Real logo interaction; target home context; absolute top content; settled view | Logo intentionally removes the pinned cutoff; live total is diagnostic rather than immutable |
| Background diagnostic | PP10 | Independent position-map span and settled indexed context | Never rank against user-action latency targets |

## Short Perceived Rows

| ID | Status | Fixed trigger/context | Required correlated phases | Honest completion oracle | Metadata / blocker | Next action |
|---|---|---|---|---|---|---|
| PP1 | `Complete` | Real SearchBar Grid-logo click from pinned indexed `city:Dublin` at nonzero scroll; revision 2 | One `home-logo` ID; `t_ack`, `t_store_ready`, first-visible, visual-settled | Exact `/search?nonFree=true`; `until` absent; buffer offset, grid scroll and seek scrubber at zero; global-first real item visible and stable over next frame | Unpinned live total persists as per-campaign min/max diagnostic; seek regime and successful routes remain strict | Use as full-state reset-to-absolute-top reference |
| PP2 | `Complete` | Exact Width selection with no focus; revision 2 | One `sort-no-focus` ID; `t_ack`, `t_store_ready`, first-visible, visual-settled | Width context visible with real item; container/item stable within 1px over next frame | Historical File size rows invalid; verified Width row persists seek regime/direct ES | Use as unanchored sort/search reference |
| PP3 | `Complete` | Focused image plus exact authored Credit sort; revision 2 | One `sort-around-focus` ID; `t_ack`, `t_store_ready`, first-visible, visual-settled | Same focused identity visible and top/left stable within 1px over next frame | Persists settled total, seek regime and direct-ES route category in verified run | Use with PP4 as focused-sort reference implementation |
| PP4 | `Complete` | Focused image; real direction toggle; revision 2 | One `sort-around-focus` ID; `t_ack`, `t_store_ready`, first-visible, visual-settled | Focused cell intersects results viewport; top/left stable within 1px over next frame | Persists total, seek regime, direct-ES route category in verified run | Use as focused-sort reference implementation |
| PP5 | `Complete` | Exact accessible Free-to-use checkbox; revision 2 | One `filter-toggle` ID; `t_ack`, `t_store_ready`, first-visible, visual-settled | Checkbox and free-only params agree; real item visible; container/item stable within 1px over next frame | Successful routes only; verified seek regime/direct ES | Use as exact-filter search reference |
| PP6 | `Complete` | Grid-to-table at top, no anchor; revision 2 | One `density-swap` ID; first-visible, visual-settled | Grid absent; table mounted with real row; table/row rectangles stable within 1px over next frame | Persists settled total, seek corpus and `client-only`; rejects any data request | Use as top-density reference implementation |
| PP7 | `Complete` | Track click near 50% with DOM-authoritative `seek` regime; revision 2 | One consumed `scrubber-seek` ID; `t_ack`, `t_store_ready`, first-visible, visual-settled | Real visible content stable over next frame; achieved ratio within 0.15 of requested | Persists requested/achieved ratio, total, seek regime and successful routes | Use as seek-click reference implementation |
| PP7b | `Complete` | Thumb drag/release near 70% with authoritative `seek` regime; revision 2 | One consumed `scrubber-seek` ID starting on release; `t_ack`, `t_store_ready`, first-visible, visual-settled | Real visible content stable over next frame; achieved ratio within 0.15 | Continuous drag excluded; requested/achieved ratio and direct-ES route retained | Use with PP7 as release-seek reference |
| PP7c | `Complete` | Track click near 80% with authoritative `buffer` regime; revision 2 | One consumed `scrubber-scroll` ID; first-visible, visual-settled | Real visible content stable over next frame; achieved ratio within 0.05; no successful data route | Lazy sort-distribution fetch preloaded outside measured window | Use as client-only buffer-scroll reference |
| PP8 | `Complete` | Post-CQL/debounce `queryChange("sport")`; revision 2 | One consumed `search` interaction ID owned by one search generation; `t_ack`, `t_store_ready`, first-visible, visual-settled | Exact sport context visible with real item; container/item stable within 1px over next frame | Explicitly post-CQL latency; verified focus-preserving search branch, seek regime/direct ES | Use as query-search reference implementation |
| PP9 | `Complete` | Real sole `subject:sport` chip delete-handle click from pinned seek context; revision 2 | One `chip-remove` ID; `t_ack`, `t_store_ready`, first-visible, visual-settled | Exact pinned empty-query URL/store context; pre-click app-owned viewport anchor remains visible and stable over next frame | Anchor identity stays in browser memory; signed drift persists only as diagnostic; verified seek regime/direct ES | Use as real CQL token-removal and visual-context preservation reference |
| PP10 | `Diagnostic` | Automatic map fetch in fixed pinned `uploader:avalonred` indexed context; revision 2 | One `position-map` ID; `t_store_ready` after publication | Exact context map published with entry count equal to settled total | Retained background diagnostic; separately displayed with no user-action target; verified 21,627 entries/direct ES | Use as indexed position-map construction diagnostic |
| PP6b | `Complete` | Midpoint of actual scrollable visible-start range after ordinary extension settles; no anchor; revision 2 | One `density-swap` ID; first-visible, visual-settled | Freeze resulting buffer/position; target table real/stable over next frame | Verified range ratio 0.5, setup extension retained, client-only density window | Use as mid-scroll density reference |
| PP6c | `Complete` | Post-eviction buffer recentered and quiescent; no anchor; revision 2 | One `density-swap` ID; first-visible, visual-settled | Require eviction generation, bufferOffset > 0, no extension in flight; table real/stable over next frame | Sequential setup extensions avoid bounce/stall; verified client-only density window | Use as post-eviction density reference |

## Long-Journey Rows

| ID | Status | Fixed trigger/context | Required correlated phases | Honest completion oracle | Metadata / blocker | Next action |
|---|---|---|---|---|---|---|
| JA1 | `Complete` | Browser epoch immediately before cold navigation to fixed buffer query; revision 2 | Synthetic cross-document `navigation-search` ID; store-ready, first-visible, visual-settled | Exact query lifecycle settled; buffer regime; real item/container stable over next frame | Includes navigation/bootstrap; background work excluded | Use as cold buffer navigation reference |
| JA2 | `Complete` | Real double-click on prescribed in-memory identity; revision 2 | One `open-detail` ID; store-ready, first-visible, visual-settled | Detail route/render identity agree; current image decoded; image/detail geometry stable within 1px over next frame | Identity stays in browser memory; persists total, buffer regime and successful direct-ES route category | Use as decoded detail-open reference |
| JA3 | `Complete` | Exact `colourModel=RGB` metadata control on prescribed in-memory identity; revision 2 | One `metadata-click` ID; ack, store-ready, first-visible, visual-settled | Exact `colourModel:RGB` URL/lifecycle; detail absent; real result/container stable within 1px over next frame | Semantic field/value attributes replace broad title selector; identity stays in browser memory; direct-ES route retained | Use as metadata-to-search reference |
| JB1 | `Complete` | Browser epoch immediately before cold navigation to fixed indexed query; revision 2 | Synthetic cross-document `navigation-search` ID; store-ready, first-visible, visual-settled | Exact query lifecycle settled; indexed regime; real item/container stable over next frame | Position-map background span remains separate | Use as cold indexed navigation reference |
| JB2 | `Complete` | Preloaded exact `subject:sport` control from fixed indexed base; revision 2 | One `facet-click` ID plus one matched no-anchor `search` ID per repetition; ack, store-ready, first-visible, visual-settled | Exact target URL/lifecycle; real result/container stable within 1px over next frame | Run index alternates control→facet / facet→control; even runs required for history; control retained separately and sequential subtraction forbidden | Use as balanced anchored-facet reference |
| JB3 | `Complete` | Exact authored Colour Profile `sRGB IEC61966-2.1` Alt-click from post-JB2 context; revision 2 | One `facet-click` ID; ack, store-ready, first-visible, visual-settled | Exact quoted negative query; real result/container stable within 1px over next frame; indexed regime retained | Historical dynamic rows invalid; absent `subject:news` candidate rejected; verified total 2,928 and direct ES | Use as exact facet-exclusion reference |
| JB4 | `Complete` | Track click near 50% from fixed 2,928-result post-JB3 context; authoritative `indexed` mode; revision 2 | One `scrubber-scroll` ID; first-visible, visual-settled | Reject skeleton-only state; real visible content stable within 1px over next frame; achieved ratio within 0.05 | Delayed hook-owned scroll-seek is not falsely claimed as store-ready; verified direct-ES window fetch and achieved 0.5091 | Use as indexed direct-scroll reference |
| JB5 | `Complete` | FullscreenPreview exit after fixed 20-step traversal from post-JB4 indexed context; revision 2 | One `fullscreen-exit` ID; native-exit, first-visible, visual-settled | Native fullscreen absent; preview inactive; focused destination visible and list/cell geometry stable within 1px over next frame | Distinct from ImageDetail fullscreen; identity stays in browser memory; verified client-only exit and indexed destination | Use as FullscreenPreview exit reference |

## Progress Summary

| Group | Complete | Ready | Blocked | Diagnostic | Total |
|---|---:|---:|---:|---:|---:|
| Short | 13 | 0 | 0 | 1 | 14 |
| Long | 8 | 0 | 0 | 0 | 8 |
| **Total** | **21** | **0** | **0** | **1** | **22** |

## Execution Order

All 22 rows are resolved: 21 user-action rows are `Complete`; PP10 is retained
as a separately displayed `Diagnostic` with no user-action target.

A5 and its schema cleanup are complete. Obsolete optimistic producer marks,
adjacency calculators, and revision-2 compatibility aliases have been removed.
Historical alias fields remain explicitly labeled as legacy dashboard evidence;
PP10 stays classified as background diagnostic.
