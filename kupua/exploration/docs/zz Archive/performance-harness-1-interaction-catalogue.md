# Performance Harness Interaction Catalogue

**Status:** report-only catalogue, ownership links updated 10 September 2026  
**Scope:** current read-only Kupua interactions and their performance-relevant state transitions  
**Row budget:** 75 semantic transitions; hard cap 75

**Series:** **1** interaction catalogue (this file) ->
**2** [measurement validity](performance-harness-2-validity-audit.md) ->
**3** [coverage and retirement plan](performance-harness-3-coverage-and-retirement-plan.md) ->
**4** [habitual E2E election appendix](performance-harness-4-habitual-e2e-consolidation-audit.md) ->
**5** [repeatable execution workplan](performance-harness-5-workplan.md).

## Purpose

This catalogue answers two questions:

1. What meaningfully different actions can a user perform in Kupua today?
2. Which of those actions have direct, proxy, or no performance measurement?

It is not an exhaustive list of controls or state permutations. Equivalent
affordances share one row unless they enter different code, preserve different
state, or create different history. Domain documents remain authoritative for
behavior; this file is a routing and performance-coverage ledger.

The April capabilities report contains a useful but stale 77-action inventory
([old inventory](../03%20Ce%20n'est%20pas%20une%20pipe%20dream/kupua-00-capabilities-report.md#L824-L909)).
This catalogue replaces its interaction list for current performance planning;
it does not replace the rest of that report.

## Evidence Rules

- **Behavior owner:** current source or architecture documentation.
- **Executable evidence:** a current local E2E or focused unit contract.
- **Perf: direct:** the action itself is inside a persisted measurement window.
- **Perf: proxy:** a shared downstream path is measured, but not this trigger or
  pre-trigger work.
- **Perf: none:** no persisted performance result answers the row.
- A console-only diagnostic, prototype stress script, or action outside a trace
  window is not performance coverage.

## Variation Axes

Apply these axes only where they change implementation or expected state. Do
not form their full Cartesian product.

| Axis | Meaningful values | Split criterion |
|---|---|---|
| Result regime | buffer (`<=1k`), indexed (`1k-65k`), seek (`>65k`) | Different scrolling, seek, or buffer mechanism |
| Interaction mode | explicit focus, phantom focus, selection | Different anchor or click policy |
| Modality | pointer, keyboard, coarse pointer/touch | Different event/gesture implementation |
| Lifecycle | warm SPA, reload, Back/Forward, cold/deep link | Different restoration or history path |
| Data path | direct ES, strangler/media-api, optional API | Different request owner or payload path |
| View | grid, table, detail, fullscreen | Different virtualizer/layout/gesture path |
| Data condition | populated, sparse/missing, null zone, high-cardinality | Different query/seek algorithm |

## Search And Refinement

| ID | Semantic transition and meaningful variants | Completion and state contract | Cost path | Current evidence | Perf |
|---|---|---|---|---|---|
| S01 | Click the Grid logo in the list toolbar or detail header to reset the app | `resetToHome()` clears query/filters/sort/focus/selection, loads the default page at top, then navigates; its popstate-like history and table-to-grid flash prevention are distinct from the keyboard Home key | Search + render; media-api only for supported `searchAfter` shapes | [UI command](../../../src/components/SearchBar.tsx#L146-L170), [reset owner](../../../src/lib/reset-to-home.ts), [clean-top E2E](../../../e2e/local/buffer-corruption.spec.ts#L100-L213), [history E2E](../../../e2e/local/browser-history.spec.ts#L762-L853) | Direct: PP1 (`home-logo`); proxy: P1/P9 |
| S02 | Edit CQL text and let debounce commit | Latest text generation reaches URL, then latest search generation settles | ProseMirror/CQL + debounce + search | [CQL component](../00%20Architecture%20and%20philosophy/component-detail.md#L202-L206), [typed-history E2E](../../../e2e/local/browser-history.spec.ts#L215-L253) | Proxy: PP8 starts after real keystroke/CQL work |
| S03 | Discover CQL field keys with `+`/`-` | Suggestion list reflects current key prefix; no search until commit | Client parser/typeahead registry | [CQL owner](../../../src/components/CqlSearchInput.tsx), [browser technique](../embedded-browser-playbook.md#L185-L270) | None |
| S04 | Fetch and accept value typeahead suggestion | Query-scoped aggregation resolves; accepted option becomes one clean chip | Direct-ES aggregation today + CQL UI | [typeahead owner](../../../src/lib/lazy-typeahead.ts), [browser technique](../embedded-browser-playbook.md#L218-L270) | None |
| S05 | Remove a chip or clear the full query | URL query changes once; replacement search settles; clear button and final-chip removal converge after trigger | Search + render | [SearchBar owner](../00%20Architecture%20and%20philosophy/component-detail.md#L166-L183), [downstream query-change E2E](../../../e2e/local/browser-history.spec.ts#L137-L215); no retained E2E directly owns the chip/clear affordance after Phase C | Direct downstream only: PP9 synthesizes `queryChange` rather than clicking a chip |
| S06 | Toggle Free-to-use filter | `nonFree` URL state changes and replacement search settles | Search + render | [filter owner](../00%20Architecture%20and%20philosophy/component-detail.md#L188-L190) | Direct: PP5; proxy: P9 |
| S07 | Apply date field/preset | Chosen date field and range serialize to UTC URL state; search settles | Search + render; relative-date calculation before trigger | [date owner](../00%20Architecture%20and%20philosophy/component-detail.md#L192-L194) | Proxy: generic result replacement only |
| S08 | Draft and commit/cancel a custom date range | Commit changes URL/search; cancel/outside/Escape preserve prior URL | Client dropdown, then search only on commit | [date owner](../../../src/components/DateFilter.tsx) | None |
| S09 | Add/remove a positive facet | One AST-aware chip transition; replacement search settles | First aggregation may precede search; then search + render | [facet owner](../00%20Architecture%20and%20philosophy/component-detail.md#L246-L248), [collections/facets journey](../../../e2e-perf/perceived-long.spec.ts#L418-L473) | Direct downstream: JB2; first panel/aggregation load excluded |
| S10 | Add/flip/remove a negative facet with Alt | Polarity transition is reflected in CQL; replacement search settles | Same as S09, distinct input policy | [facet semantics](../embedded-browser-playbook.md#L272-L306), [journey](../../../e2e-perf/perceived-long.spec.ts#L475-L505) | Direct: JB3, but current selector/action label is unstable |
| S11 | Expand a facet and fetch more buckets | Expanded bucket set renders or absence is explicit; query unchanged | Aggregation only | [facet owner](../00%20Architecture%20and%20philosophy/component-detail.md#L246-L248) | None |
| S12 | Click metadata/table/pill to search; replace, append, or exclude | Metadata plain click replaces; Shift appends; Alt excludes; search and navigation contract settle | Search + render; may leave detail and create history | [metadata semantics](../00%20Architecture%20and%20philosophy/component-detail.md#L226-L228), [history E2E](../../../e2e/local/browser-history.spec.ts#L647-L686), [merged trigger/editability E2E](../../../e2e/local/ui-features.spec.ts#L770-L855) | Direct: JA3 for one plain metadata value; modifiers/other surfaces proxy only |
| S13 | Apply a ticker/saved-filter badge | Ticker clause appends; search settles; zero/total badges remain hidden | Search + render; background count state | [status owner](../00%20Architecture%20and%20philosophy/component-detail.md#L196-L200) | Proxy: generic filter/search only |
| S14 | Select/clear a collection | Exclusive collection chip and automatic sort enter/exit atomically | Optional collections API + aggregation + search | [collection owner](../00%20Architecture%20and%20philosophy/component-detail.md#L250-L258), [collection E2E](../../../e2e/local/collections.spec.ts#L127-L184) | None; generic search replacement is insufficient |
| S15 | Expand/collapse AI search, submit/clear AI text | Widget state and debounced URL text agree; AI branch returns bounded in-memory results; sort enters/exits AI policy | Bedrock embed + ES KNN; no PIT/pagination | [AI owner](../00%20Architecture%20and%20philosophy/component-detail.md#L170-L182), [AI architecture](../00%20Architecture%20and%20philosophy/08-ai-search.md) | None |

## Ordering

| ID | Semantic transition and meaningful variants | Completion and state contract | Cost path | Current evidence | Perf |
|---|---|---|---|---|---|
| O01 | Change sort field without anchor | New canonical sort, first page, and URL settle at top | Search + distributions/map as applicable | [sort owner](../00%20Architecture%20and%20philosophy/component-detail.md#L260-L280), [toolbar E2E](../../../e2e/local/ui-features.spec.ts#L404-L447) | Direct: P9, PP2 |
| O02 | Change sort field with explicit/selection/phantom anchor | Anchor survives or documented fallback applies; target is painted in viewport | Multi-request sort-around-focus + render | [focus contract](../00%20Architecture%20and%20philosophy/02-focus-and-position-preservation.md), [focus E2E](../../../e2e/local/focus-preservation.spec.ts#L42-L191) | Direct: P6, PP3 |
| O03 | Reverse sort without anchor | Canonical direction changes; first page differs; top reset | Search + render | [sort E2E](../../../e2e/local/scrubber.spec.ts#L929-L963) | Proxy: P9/PP2 field change, no dedicated direction row |
| O04 | Reverse sort with anchor | Same identity remains focused and visible in its new rank | Sort-around-focus + render | [sort E2E](../../../e2e/local/scrubber.spec.ts#L1019-L1108) | Direct: PP4; P6 uses a direction change |
| O05 | Enter/leave automatic collection or AI sort | Prior user sort is restored when special mode clears | URL/orchestration + search | [collection E2E](../../../e2e/local/collections.spec.ts#L154-L184), [AI owner](../00%20Architecture%20and%20philosophy/component-detail.md#L170-L182) | None |

## View And Layout

| ID | Semantic transition and meaningful variants | Completion and state contract | Cost path | Current evidence | Perf |
|---|---|---|---|---|---|
| V01 | Switch grid/table at top without anchor | New view paints; top remains coherent | Client mount/unmount + images | [views](../00%20Architecture%20and%20philosophy/component-detail.md#L208-L216) | Direct: P4a/P4b, PP6 |
| V02 | Switch grid/table at depth with explicit or phantom anchor | Anchor remains visible under changed row/column geometry | Client virtualizers; possible background extend | [density E2E](../../../e2e/local/scrubber.spec.ts#L2013-L2139) | Direct: PP6b/PP6c; P12 switches are outside its probe window |
| V03 | Open/close Browse or Details panel by pointer/keyboard | Panel state, viewport width, and anchor settle; optional aggregation prefetch is separate | Client layout; Browse may trigger aggregation | [panel E2E](../../../e2e/local/ui-features.spec.ts#L278-L399) | Direct jank: P5a/P5b/P5c; no perceived metric |
| V04 | Drag panel divider or double-click to close | Width commits without incoherent content shift; double-click reaches closed state | Continuous client reflow | [panel owner](../00%20Architecture%20and%20philosophy/component-detail.md#L242-L244) | None |
| V05 | Expand/collapse persisted panel accordion | Section visibility and persisted state update | Client-only; section content may fetch | [panel owner](../00%20Architecture%20and%20philosophy/component-detail.md#L242-L248) | None |
| V06 | Drag a table column resize handle | CSS width changes continuously without cell remount storm | Client-only table layout | [table owner](../00%20Architecture%20and%20philosophy/component-detail.md#L210-L212) | Direct: P16a |
| V07 | Auto-fit one/all table columns | Measured width applies and table remains operable | DOM measurement + client layout | [table owner](../00%20Architecture%20and%20philosophy/component-detail.md#L210-L212) | Direct: P16b covers one header only |
| V08 | Show/hide a table column through context menu | Visibility state and horizontal layout settle | Client table rebuild | [table owner](../00%20Architecture%20and%20philosophy/component-detail.md#L210-L212) | None |
| V09 | Resize browser/mobile orientation so grid column count changes | Stable image anchor survives responsive reflow; controls remain reachable | ResizeObserver + virtualizer layout | [grid owner](../00%20Architecture%20and%20philosophy/component-detail.md#L214-L216), [geometry test](../../../src/lib/viewport-anchor-geometry.test.ts) | None |

## Position And Focus

| ID | Semantic transition and meaningful variants | Completion and state contract | Cost path | Current evidence | Perf |
|---|---|---|---|---|---|
| P01 | Forward scroll in grid through extend/evict | Visible order advances monotonically; bounded buffer remains consistent | Client virtualizer + ES extend + images | [scrubber E2E](../../../e2e/local/scrubber.spec.ts#L866-L899) | Direct: P2, but it uses scripted rAF rather than wheel |
| P02 | Forward fast scroll in table through extend/evict | Same as P01 under table DOM/row geometry | Client table virtualizer + ES extend | [table owner](../00%20Architecture%20and%20philosophy/component-detail.md#L210-L212) | Direct: P8 with real wheel input |
| P03 | Reverse scroll across buffer start and prepend | Visible order reverses monotonically; prepend compensation avoids jump/swim | ES backward fetch + compensation | [habitual backward E2E](../../../e2e/local/scrubber.spec.ts#L336-L492) | None |
| P04 | Indexed-scroll skeleton replacement while buffer slides | Skeletons become real items at fixed global positions; no wrong-direction jump or blank viewport | Position map + direct ES today + virtualizer | [scroll architecture](../00%20Architecture%20and%20philosophy/03-scroll-architecture.md) | None; PP10 measures map build, not scrolling |
| P05 | Scrubber click/drag in buffer tier | Real content scrolls synchronously; no seek request | Client DOM scroll | [tier helper contract](../../../e2e/shared/helpers.ts#L584-L776) | Direct perceived: PP7c; jank only via broader seeks |
| P06 | Scrubber click/drag in indexed tier | ScrollTop changes, debounced `_seekGeneration` completes when outside buffer, real cells paint | Client scroll + position-map cursor fetch | [tier helper contract](../../../e2e/shared/helpers.ts#L463-L565) | Setup/proxy only: JB4 can land here; no direct jank metric |
| P07 | Scrubber click in seek tier; date/keyword/null-zone | First useful page paints near requested ratio; sparse and keyword algorithms remain distinct | One or multiple ES/media-api calls | [scrubber E2E](../../../e2e/local/scrubber.spec.ts#L1264-L1418) | Direct: P3/P3b/P11/P11b and PP7 |
| P08 | Scrubber thumb drag/release in seek tier | Continuous thumb remains smooth; release reaches final page | Client drag then network seek | [scrubber E2E](../../../e2e/local/scrubber.spec.ts#L224-L253) | Direct: P7 conflates drag/release; PP7b measures release onward |
| P10 | Arrow row navigation with no explicit focus | One row scroll, no focus ring/identity set | Client scroll | [keyboard E2E](../../../e2e/local/keyboard-nav.spec.ts#L34-L128) | None |
| P11 | PageUp/PageDown with no explicit focus | One row-snapped page scroll, no focus | Client scroll; may extend | [keyboard E2E](../../../e2e/local/keyboard-nav.spec.ts#L56-L73) | Proxy: scroll metrics only |
| P12 | Home/End with no explicit focus | Absolute boundary reached without creating focus | Client scroll or seek/network by tier | [keyboard E2E](../../../e2e/local/keyboard-nav.spec.ts#L75-L106) | None |
| P13 | Arrow navigation with explicit focus in grid/table | Focus moves by visual row/item and remains painted | Client focus + possible scroll/extend | [keyboard E2E](../../../e2e/local/keyboard-nav.spec.ts#L130-L190) | None |
| P14 | Page/Home/End with explicit focus | Boundary/page target becomes focused and painted; deep paths may seek | Client + conditional network | [keyboard E2E](../../../e2e/local/keyboard-nav.spec.ts#L192-L303) | None |
| P15 | Change explicit/phantom focus mode and click a result | Explicit click focuses; phantom click opens detail; no phantom ring | Client preference + different click policy | [phantom E2E](../../../e2e/local/phantom-focus.spec.ts#L28-L123) | None |

## Inspect, Traverse, And Manipulate Images

| ID | Semantic transition and meaningful variants | Completion and state contract | Cost path | Current evidence | Perf |
|---|---|---|---|---|---|
| I01 | Open detail by double-click/Enter or phantom single-click | Detail route identity and rendered detail agree; list remains mounted | Client route + full image/API detail | [detail E2E](../../../e2e/local/ui-features.spec.ts#L27-L82) | Direct jank: P13a; perceived: JA2, but neither waits for image decode |
| I02 | Close detail by button/Backspace/double-click/back | Correct list entry and image placement restore; close method preserves history semantics | History + client scroll/conditional seek | [detail return E2E](../../../e2e/local/ui-features.spec.ts#L84-L149), [history E2E](../../../e2e/local/browser-history.spec.ts#L255-L411) | Direct jank: P13b; no perceived close metric |
| I03 | Traverse previous/next in detail by button/key | URL image identity changes without extra history entries; landing image becomes usable | Prefetch/image decode + conditional buffer fetch | [traversal E2E](../../../e2e/local/ui-features.spec.ts#L151-L183) | Direct: P14a-d |
| I04 | Traverse across a buffer boundary, then return/reload | Buffer extends; last-viewed identity restores and paints | Image + searchAfter + history snapshot | [history E2E](../../../e2e/local/browser-history.spec.ts#L928-L1000) | None |
| I05 | Enter **FullscreenPreview** from grid/table | Only list views can enter this separate component: `f` requires an explicitly focused image; middle-click focuses the row/cell and enters imperatively; entry creates a same-URL phantom history item and does not mount detail | Fullscreen API + image | [preview owner](../../../src/components/FullscreenPreview.tsx#L1-L29), [grid entry](../../../src/components/ImageGrid.tsx#L794-L822), [table entry](../../../src/components/ImageTable.tsx#L537-L561) | None; JB5 entry is setup outside its trace window |
| I06 | Traverse inside **FullscreenPreview** | Focused list identity advances; preview image/prefetch follows; zoom suppresses traversal; underlying list remains the return surface | Image pipeline + conditional extend/seek | [preview navigation](../../../src/components/FullscreenPreview.tsx#L425-L454), [correctness E2E](../../../e2e/local/ui-features.spec.ts#L583-L686) | None; JB5's 20 traversals are deliberately outside the measured window |
| I07 | Exit **FullscreenPreview** to grid/table | Esc/Backspace/`f`/middle-click/browser Back clears native fullscreen and phantom entry, then conditionally scrolls the last-viewed focused image into the list | Fullscreen API + client scroll/conditional seek | [preview exit](../../../src/components/FullscreenPreview.tsx#L185-L277), [preview history](../../../src/components/FullscreenPreview.tsx#L356-L417) | Direct perceived: JB5 exit/restoration only |
| I08 | Enter **ImageDetail fullscreen** while detail is already open | This is ImageDetail's own fullscreen state: desktop `f` or middle-click; coarse pointer single-tap. It keeps the detail route/component and metadata is hidden | Fullscreen API on stable detail container; no FullscreenPreview | [detail owner](../../../src/components/ImageDetail.tsx#L17-L31), [entry wiring](../../../src/components/ImageDetail.tsx#L329-L438) | Direct jank: P15a |
| I09 | Traverse inside **ImageDetail fullscreen** | Detail URL image changes via replace; the same fullscreened container survives reconciliation; zoom suppresses traversal | Detail traversal + image prefetch/conditional buffer fetch | [detail invariant](../../../src/components/ImageDetail.tsx#L17-L24), [navigation wiring](../../../src/components/ImageDetail.tsx#L494-L527) | Direct jank: P15b |
| I10 | Exit **ImageDetail fullscreen** back to windowed detail | Escape/`f`/middle-click/coarse single-tap or fullscreen pull-down exits native fullscreen but retains the detail route; Backspace is a separate close-detail/history action | Fullscreen API + detail layout | [detail exit wiring](../../../src/components/ImageDetail.tsx#L390-L438), [keyboard/middle-click](../../../src/components/ImageDetail.tsx#L494-L557) | Direct jank: P15c |
| I11 | Zoom in either fullscreen implementation by click/wheel/Space/keys or touch pinch/double-tap | Scale changes within bounds; traversal disables while zoomed; image change resets zoom and may load higher resolution | Client transforms + optional hi-res image | [gesture owner](../00%20Architecture%20and%20philosophy/component-detail.md#L130-L136) | None |
| I12 | Pan a zoomed fullscreen image by drag or keyboard, including momentum | Translation remains bounded/usable and settles after momentum | rAF client animation | [gesture owner](../00%20Architecture%20and%20philosophy/component-detail.md#L130-L136) | None |
| I13 | Swipe between images in ImageDetail, windowed or fullscreen | Horizontal swipe commits previous/next or springs back; shared detail traversal and prefetch update the route/image | Touch gesture animation + image prefetch | [detail swipe wiring](../../../src/components/ImageDetail.tsx#L337-L369) | None |
| I14 | Pull down on ImageDetail on touch | Windowed detail dismisses to the positioned list; detail fullscreen uses the same gesture family to exit fullscreen back to detail; subthreshold gestures spring back | Touch animation + history/scroll or Fullscreen API | [two dismiss outcomes](../../../src/components/ImageDetail.tsx#L371-L404) | None |

## Selection

| ID | Semantic transition and meaningful variants | Completion and state contract | Cost path | Current evidence | Perf |
|---|---|---|---|---|---|
| L01 | Enter selection mode/toggle one item by tickbox, Cmd-click, or long-press | Selected Set, anchor, metadata cache, UI mode and persistence agree | Client store + optional `getByIds` | [selection E2E](../../../e2e/local/selections.spec.ts#L85-L166), [mobile E2E](../../../e2e/local/selections-mobile.spec.ts#L148-L232) | Prototype SS1 only; not persisted/reported |
| L02 | Add/remove an in-buffer range | Anchor polarity and contiguous IDs produce one atomic Set update | Client map walk + reconcile | [grid/table selection E2E](../../../e2e/local/selections.spec.ts#L308-L397), [coarse-pointer range E2E](../../../e2e/local/selections-mobile.spec.ts#L212-L270) | Prototype SS2a is not trustworthy coverage |
| L03 | Add/remove an out-of-buffer range | Bounded server walk completes or cap feedback appears; final Set is coherent | `getIdRange` network + reconcile | [range owner](../00%20Architecture%20and%20philosophy/component-detail.md#L153-L155) | None; SS2b is a placeholder |
| L04 | Deselect anchor/elect fallback anchor | Anchor is selected or null; later preservation uses valid anchor | Client store | [selection owner](../00%20Architecture%20and%20philosophy/component-detail.md#L141-L155) | None |
| L05 | Clear selection from status/FAB | Set/cache/reconciled view and selection UI clear once | Client store + persistence | [desktop clear E2E](../../../e2e/local/selections.spec.ts#L526-L565), [mobile FAB E2E](../../../e2e/local/selections-mobile.spec.ts#L295-L315) | None |
| L06 | Preserve selection through sort/view/reload | Selection identity persists as policy states; selection anchor can preserve position | Store + sessionStorage + sort/view path | [anchor/sort E2E](../../../e2e/local/selections.spec.ts#L145-L232), [lifecycle E2E](../../../e2e/local/selections.spec.ts#L679-L764) | None |
| L07 | Clear selection on query/navigation according to policy | Clear occurs without stale reconciled UI or position corruption | Orchestration + store | [selection lifecycle E2E](../../../e2e/local/selections.spec.ts#L663-L815) | None |
| L08 | Reconcile and render metadata for large/mixed selection | Chunked reconciliation settles; multi-image fields/counts match selected denominator | Idle chunks + React panel + optional mget | [selection owner](../00%20Architecture%20and%20philosophy/component-detail.md#L141-L162), [metadata E2E](../../../e2e/local/selections.spec.ts#L434-L615) | Prototype SS3/SS4 only; no durable metrics |

## History And Lifecycle

| ID | Semantic transition and meaningful variants | Completion and state contract | Cost path | Current evidence | Perf |
|---|---|---|---|---|---|
| H01 | Back/Forward across query or sort contexts | URL, latest search generation, result context, focus policy and snapshot agree | Browser history + search | [history E2E](../../../e2e/local/browser-history.spec.ts#L131-L253) | None |
| H02 | Back/Forward across density change | Density and prior viewport context restore without phantom entries | Browser history + client layout | [history E2E](../../../e2e/local/browser-history.spec.ts#L617-L644) | None |
| H03 | Close/reopen detail via Back/Forward | One detail entry reopens correct rendered identity; traversal does not grow history | Browser history + detail/image | [history E2E](../../../e2e/local/browser-history.spec.ts#L255-L473) | None |
| H04 | Metadata search from detail, then Back | Exactly one search entry; detail and correct image restore | Browser history + search + image | [history E2E](../../../e2e/local/browser-history.spec.ts#L646-L686) | JA3 measures outbound action only |
| H05 | Leave and restore a deep list position | Snapshot anchor/ratio restores visibly, including conditional buffer load | sessionStorage + history + search/seek | [history E2E](../../../e2e/local/browser-history.spec.ts#L878-L924) | None |
| H06 | Reload list/detail after traversal or deep position | Fresh generation hydrates snapshot and correct identity/placement | Full reload + search/image | [history E2E](../../../e2e/local/browser-history.spec.ts#L927-L1157) | P1 is not a restoration scenario |
| H07 | Enter by cold/deep URL or pasted URL in an existing tab | Initial entry gets stable key; close behavior does not return to referring site or synthesize entries | Full navigation + route/search/image | [history E2E](../../../e2e/local/browser-history.spec.ts#L475-L645) | None |

## Transient And Optional-System Transitions

| ID | Semantic transition and meaningful variants | Completion and state contract | Cost path | Current evidence | Perf |
|---|---|---|---|---|---|
| T01 | Refresh when new-images ticker appears | Poll result becomes visible; click performs one fresh search and clears conflicting selection | Periodic count + search | [status owner](../00%20Architecture%20and%20philosophy/component-detail.md#L196-L200) | None |
| T02 | Show/dismiss/expire toast | Alert is announced, queued and removed without shifting primary workspace | Client timer/store | [root-mount/dismiss E2E](../../../e2e/local/toast.spec.ts#L39-L60), [component matrix](../../../src/components/ToastContainer.test.tsx#L136-L157) | None; dedicated perf test not justified |
| T04 | Rapidly supersede searches/seeks/sorts | Only latest generation commits; abandoned requests do not flash stale content or corrupt history | Abort/generation + mixed requests | [rapid seek E2E](../../../e2e/local/scrubber.spec.ts#L1121-L1187), [history readiness](../../../e2e/local/browser-history.spec.ts#L49-L120) | Proxy only; no dedicated cancellation metric |

## Coverage Summary

| Coverage | Interaction IDs | Interpretation |
|---|---|---|
| Strong direct | O01-O04, V01-V03, V06-V07, P01-P02, P07-P08, I01-I03, I07-I10 | Current portfolio's centre of gravity |
| Partial/proxy | S01-S02, S05-S06, S09-S13, O05, P05-P06, P10-P11, I04, H04, T04 | Shared downstream cost is measured, but trigger, regime, or restoration is not |
| No durable perf evidence | S03-S04, S07-S08, S11, S14-S15, V04-V05, V08-V09, P03-P04, P12-P15, I05-I06, I11-I14, L01-L08, H01-H03, H05-H07, T01-T02 | Candidates must still pass value/risk review before adding tests |

## Maintenance And Stop Rule

1. Add a row only when the action creates a distinct state transition, cost
   path, preservation contract, or history entry.
2. Add a variant to an existing row for equivalent controls or data values.
3. Keep per-field metadata behavior in the field catalogue, not here.
4. Keep browser-driving techniques in `embedded-browser-playbook.md`, not here.
5. Keep bugs and implementation plans out of this catalogue.
6. If the catalogue would exceed 75 rows, merge equivalent transitions or
   challenge the premise before adding another row.
