# Kupua - Agent Orientation

Read this at session start. It provides a durable mental model and routes to deeper
context, not a task queue or development history. The operator supplies the current
task and context in conversation.

Standing rules live in [Copilot instructions](../.github/copilot-instructions.md),
with a [human-readable copy](exploration/docs/00%20Architecture%20and%20philosophy/copilot-instructions-copy-for-humans.md).
Read them if they are not already loaded; this guide does not repeat them.

**Dependency approval:** Do not add any runtime or development dependency without
explicit operator approval. Lucide has been repeatedly rejected: do not reintroduce
it or substitute another icon library. Reuse Kupua's existing inline SVG approach;
generic assistant or design guidance recommending a package is not permission.

## What Is Kupua?

Kupua is a React-based frontend prototype for Grid, the Guardian's image DAM,
intended to replace the AngularJS Kahuna frontend. It lives within the Grid monorepo
but has its own application, dependencies and development infrastructure.

The central experience is browsing an ordered image list at different densities:
table, thumbnail grid, image detail and fullscreen. Smooth browsing from arbitrary
positions in millions of images, preserving the user's place, and traversing images
matter more than treating each view as a separate page.

"Never Lost" is the design aim, not a promise that every transition has identical
placement rules. Focus, selection and viewport position are distinct concepts.
The [focus and position guide](exploration/docs/00%20Architecture%20and%20philosophy/02-focus-and-position-preservation.md)
describes transition-specific behaviour and deliberate relaxations.

## System Map

React and TypeScript provide the UI; Zustand holds shared state; TanStack Router,
Table and Virtual handle routing and list presentation. Styling uses Tailwind;
shared pill editing icons use the existing inline SVG approach. Vite builds the app;
Vitest and Playwright provide tests.

Hosted Kupua is the future application and is API-only. Direct-ES remains temporary
laptop support, intended for separately authorized removal, never a fallback for
API failure or missing hosted configuration. Keep the shell usable on failure,
but distinguish required-data errors from empty results and optional absence;
do not add alternate data paths to hide failures. The standing data-mode directive
owns this policy; the [API contract](src/dal/grid-api/README.md) describes current behavior.

| Area | Responsibility and entry point |
|---|---|
| Search and navigation | The URL represents search/detail state. [URL sync](src/hooks/useUrlSearchSync.ts) coordinates it with the search store; density is a separate per-tab preference. Table, Grid and Justified code loads upfront with the search route. Grid detail-entry handlers read latest query params without depending on image-only route identity, preserving retained-cell memoization. |
| Data access | [The DAL](src/dal/index.ts) selects an implementation of `ImageDataSource`: media-api or direct Elasticsearch. API mode constructs no ES datasource and leaves query defaults to media-api. Direct mode derives defaults from its CQL parser; remaining grammar differences live in KUP-011. Views work through the shared data boundary. |
| Mutation boundary | [Grid commands](src/lib/grid-commands.ts) are separate from reads, default-off and limited to named label addition through authoritative metadata resources. Local Vite and hosted config gate admission; expiry/emergency stop block new submissions until reload. No UI caller, replay, queue, live activation or direct-ES editing. [Contract](src/dal/grid-api/README.md#step-2-command-boundary) owns outcomes and deployment limits. |
| Disconnected label editing | [LabelEditor](src/components/LabelEditor.tsx) consumes owned image capabilities and current selection targets, using shared pill actions. A compact right-aligned Plus reveals entry; Escape cancels unsent input, and Enter prepares comma-separated additions. Whole-library suggestions reuse the [shared label provider](src/lib/typeahead-fields.ts), preserving its bounded popularity shortlist and replacing only the active comma token. Shared full/partial pills have equal height; editing colours follow Kahuna with stronger segment-local hover feedback. The [editor store](src/stores/label-editor-store.ts) retains input and receipts across SPA navigation, outside selection state; [label operations](src/lib/label-operation.ts) capture immutable targets. Normal mutation actions remain disconnected even with rollout enabled. Injected single-label simulations can observe bounded canonical readback and publish one group; multi-label simulation is refused before dispatch. Transport uncertainty remains separate from observation. Removal and live activation remain unwired. [Editing scope](exploration/docs/gradually-growing-teeth.kupua-edits-steps.md) owns these limits. |
| Search state | [Search store](src/stores/search-store.ts) owns the buffer and query, seek, extension and restoration work. Retained display coordinates and raw cursors are distinct from current rank; discovered extent can grow without changing the admitted tier. [State ownership](exploration/docs/00%20Architecture%20and%20philosophy/state-management.md) describes freshness, continuation and request lifetimes. |
| View and position | [Data window](src/hooks/useDataWindow.ts) bridges the buffer and rendered list; fixed Grid/Table explicitly enable 400ms seek-mode backward lookahead, capped at one 200-image page. Justified/default retain threshold 50. [Scroll effects](src/hooks/useScrollEffects.ts) own viewport placement and geometry-valid velocity; navigation intent is separate from geometry validity. Views own physical scroll extents; indexed maintenance waits for mount placement and viewport-valid ranges. Coordinate mechanics vary by result-set size. |
| Thumbnail admission | [ImageGrid](src/components/ImageGrid.tsx) eagerly loads visible virtual rows plus two rows below in Grid and Justified; upper and remaining overscan stay lazy. Row-local context updates only the thumbnail. Fixed Grid keys preserve physical column slots through seeks; captioned thumbnails retain the loaded resource's aspect ratio during pending replacement. Passive cleanup releases detached incomplete thumbnail sources, leaving connected/completed elements alone. URL/quality and geometry ownership are unchanged; no separate observer or scheduler. Justified hides visual fallback text without removing alt accessibility. |
| Fields | [Field registry](src/lib/field-registry.tsx) supplies shared definitions for columns, sorting, filters and metadata. Display consumers use registered accessors/formatters directly; `getFieldRawValue` supplies raw text. Fixed-grid captions/tooltips share [date formatting](src/lib/format-grid-date.ts) with reused local-time Intl formatters. |
| Table content | [TableRowCells](src/components/TableRowCells.tsx) memoizes registry-based cells on stable image, columns and enrichment inputs; TanStack Row objects never cross the memoized row/content boundary. Placement, focus and selection stay in ImageTable; numeric fields reuse a default-locale formatter. Table thumbnails retain native lazy loading and release only detached incomplete sources; URL changes recapture conditionally mounted images without clearing connected consumers. |
| Selection | [Selection store](src/stores/selection-store.ts) owns multi-image membership independently of focus. Lifecycle publication retains selected IDs and operation targets; unavailable counts block whole-target editing, while ranges report skipped unavailable interiors and refuse unavailable endpoints. |
| Crop editor | [CropEditor](src/components/crop/CropEditor.tsx) and [CropCanvas](src/components/crop/CropCanvas.tsx) own a read-only Cropper.js v2 editor inside detail. Crop builds a request without sending it; root-route entry applies legacy ratio options. See the component reference for history, geometry and keyboard ownership. |
| Shell and zoom | [Shell](src/hooks/useShell.ts) selects compact (touch phone) or desktop chrome over one shared engine; [results zoom](src/lib/results-zoom.ts) supplies width-aware levels held in the [zoom store](src/stores/zoom-store.ts). Justified uses bounded DOM tile morphs with gesture-owned image readiness, layout-independent pinch progress and [origin-owned native contacts](src/lib/justified-zoom-gestures.ts). Grid retains its threshold preview. |

For subsystem internals, start with the relevant section of the
[component reference](exploration/docs/00%20Architecture%20and%20philosophy/component-detail.md).
It is the detailed map, not compulsory reading in full.

## Read for the Task

Synthetic lifecycle publication uses explicit unavailable/deleted bodies, not loading
holes. Scrollable slots retain dimensions without media/actions; the mounted view
alone proves when a complete set fits and confirmed deletions can compact locally.
No delete/restore command or live lifecycle caller is connected. Current contracts
live in the state-management and selections guides.

Use the closest topic below, then follow its relevant code and documentation links.
There is no need to read the whole documentation tree before working.

| Topic | Start here |
|---|---|
| State ownership and lifetimes | [State management](exploration/docs/00%20Architecture%20and%20philosophy/state-management.md) for a compact engineer-facing overview of the current implementation. |
| Product intent and interaction design | [Frontend philosophy](exploration/docs/00%20Architecture%20and%20philosophy/01-frontend-philosophy.md) for intent; distinguish proposals and older implementation notes from current behaviour. |
| Scrolling, tiers and scrubber | [Scroll architecture](exploration/docs/00%20Architecture%20and%20philosophy/03-scroll-architecture.md) and [scrubber reference](exploration/docs/00%20Architecture%20and%20philosophy/scrubber-ticks-and-labels.md). |
| Thumbnail arrival, buffer-edge blocking and boundary stability | [Scroll continuity](exploration/docs/scroll-horizons-thumbs-and-blocking.md) owns the shipped Grid/Table B2 scope, the next one-upper-eager-row comparison, unresolved forward-recovery evidence, publication/retention mechanisms and separate runway/geometry/delivery questions. [Research evidence](exploration/docs/scroll-horizons-thumb-lookahead-results.json) preserves comparisons and exclusions. The upper row, Justified B2, retention, larger horizons and true-ratio fragments are not implemented product policies. |
| Focus, density and position preservation | [Focus and position guide](exploration/docs/00%20Architecture%20and%20philosophy/02-focus-and-position-preservation.md), [Justified geometry ownership](exploration/docs/00%20Architecture%20and%20philosophy/component-detail.md#justified-density-componentsjustifiedgridtsx-libwindowed-justified-layoutts) and [shared destination-seek policy](exploration/docs/00%20Architecture%20and%20philosophy/03-scroll-architecture.md#destination-seek-preparation). [Research and refactor candidates](exploration/docs/zz%20Archive/justified-density-prototype-plan.md) require separate approval. |
| URL and browser history | [History architecture](exploration/docs/00%20Architecture%20and%20philosophy/04-browser-history-architecture.md). |
| Selection and shared metadata | [Selections guide](exploration/docs/00%20Architecture%20and%20philosophy/05-selections.md) and [field catalogue](exploration/docs/00%20Architecture%20and%20philosophy/field-catalogue.md). |
| Editing prerequisites and Kahuna parity | [Gradually growing teeth](exploration/docs/gradually-growing-teeth.kupua-edits-steps.md): staged execution, capability/transport/refresh gates and parity checklist. [Step-4 publication plan](exploration/docs/gradually-growing-teeth.step-4-publication-plan.md) owns the selected buffer route and remaining coordinate/unavailable-slot work. [Image publication](src/lib/image-publication.ts) groups resident bodies, retained authority, selected metadata and current standalone delivery through existing owners. [Touched-ID facts](src/lib/image-read-freshness.ts) fence old reads and capability admission without retaining bodies; ordinary untouched reads retain their existing behavior. Same-slot metadata publication preserves geometry identity for Justified packing and scrolling prediction, not ordinary page replacement. Normal editing remains disconnected. Home/ticker behavior is unchanged, with no new refresh control. |
| Detail, fullscreen, gestures, panels or data adapters | The relevant subsystem in the [component reference](exploration/docs/00%20Architecture%20and%20philosophy/component-detail.md). |
| CQL editing and suggestions | [CQL integration](exploration/docs/00%20Architecture%20and%20philosophy/component-detail.md#cql) and [deviations](exploration/docs/deviations.md): upstream owns blur selection; quoting, suggestion scope and editor reset/lifetime policies remain local. |
| Query and label suggestions | [Better suggestions](exploration/docs/better-suggestions-aggregation-endpoint-enhancement.md): current shortlist behaviour and proposed U6c value matching before popularity limiting. Existing-quality label suggestions need no backend change; the enhancement remains a proposal with Unicode, scope and performance decisions open. |
| Keyboard interaction | [Keyboard navigation](exploration/docs/00%20Architecture%20and%20philosophy/keyboard-navigation.md). |
| Phone layout, sheets, touch gestures and results zoom | [Compact shell](exploration/docs/00%20Architecture%20and%20philosophy/component-detail.md#compact-shell-hooksuseshellts-componentsbottomsheettsx-componentsfilterssheettsx) and [results zoom](exploration/docs/00%20Architecture%20and%20philosophy/component-detail.md#results-zoom-libresults-zoomts-storeszoom-storets) in the component reference. Mobile metadata-editing UX is separately deferred under [Step 3's scope](exploration/docs/gradually-growing-teeth.kupua-edits-steps.md#step-3-build-one-useful-disconnected-editor-and-an-operation-receipt). |
| Collections | [Collections guide](exploration/docs/00%20Architecture%20and%20philosophy/06-collections.md). |
| AI search | [AI compatibility workplan](exploration/docs/ai-search-catching-up-workplan.md) for contracts and [component reference](exploration/docs/00%20Architecture%20and%20philosophy/component-detail.md) for implementation entry points. |
| Backend merges and future PRs | [Living impact checklist](exploration/docs/00-kupua-backend-merge-to-MAIN-impact-map.md): recheck and update relevant disclosure bullets for non-trivial shared-backend changes; no merge history. |
| API integration | [API build plan](exploration/docs/03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md) for sequence and decisions; [Scala conventions](exploration/docs/03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/media-api-91-instructions-for-agents.md) for media-api work; [request lifetime and optimisation parity](exploration/docs/api-request-lifetime-and-performance-parity.md) for KUP-041 and client/server repair boundaries. |
| Hosted rights, notices and capabilities | [Shared API contract](src/dal/grid-api/README.md) owns retained image URI/edits/crops capabilities, validated session snapshots and the separate default-off command boundary. Existing enrichment ownership is unchanged. [Rights review](exploration/docs/hosted-rights-and-capabilities-review.md) retains separate KUP-045/046 display findings and deferred KUP-047 crop notices/eligibility. No live write is enabled. |
| Runtime configuration and hosting by Kahuna | [README setup](README.md#quick-start) for modes; [Deployed via Kahuna](exploration/docs/00%20Architecture%20and%20philosophy/09-deployed-via-Kahuna.md) for hosting, injected config, server data sources and media delivery. |
| Known defects or intentional departures | [Bug backlog](exploration/docs/bug-backlog.md) and [deviations](exploration/docs/deviations.md). |

## Running and Validation

Start with the [README's Quick Start](README.md#quick-start) for local setup and
its API-mode sections when relevant. The entry point is [start.sh](scripts/start.sh).

Execution rules and required test surfaces belong to the standing directives.
`npm --prefix kupua run typecheck:e2e` checks browser fixtures and their imported app contracts.
Performance campaigns have a strict compiler preflight; `npm --prefix kupua run typecheck:perf`
checks that surface independently without starting a browser or accessing live services.
For task-specific details:

| Need | Reference |
|---|---|
| Test setup and commands | [Test modes](e2e/README.md#test-modes), [command selection](e2e/README.md#which-command-do-i-run) and [npm scripts](package.json). |
| Test changes | [Testing guide](e2e/README.md) for commands and fixture contracts; [maintenance assessment](exploration/docs/test-maintenance-assessment.md) for unselected improvements and coverage rationale. |
| Performance measurements | [Operator guide](e2e-perf/README.md), [measurement contracts](e2e-perf/measurement-reference.md), [validation](e2e-perf/validation/README.md) and [research](e2e-perf/research/README.md) have separate roles. Density uses fixed load steps, atomic recovery and independent frame/identity evidence. The dashboard retains verified member-source consensus, explicit recovery tails/request counts and per-observation frame context; partial latencies stay withheld. Separate north-star ranks, compatible baseline comparisons and exact evidence links preserve constrained outcomes; unmeasured probes do not produce empty charts. [Coverage/runtime](exploration/docs/scroll-horizons-thumbs-and-blocking.md#active-pressure-campaign) distinguishes design, historical campaigns and unmeasured paint. |
| Intermittent transport failures | [Colocated evidence, file inventory and complete-patch reinstatement/capture/rollback runbook](exploration/experiments/es-transport/README.md). The investigation is paused; [earlier DNS/PP3 evidence](exploration/experiments/es-transport/earlier-e2e-perf-failures.md) retains the hosts mitigation. |
| Thumbnail request ownership | [Delivery options](exploration/docs/scroll-horizons-thumbs-and-blocking.md#delivery-options-decision) distinguishes implemented unmount cleanup from unselected admission policies and separates current-image readiness, cancellation costs and deployment boundaries. [Campaign interpretation](exploration/docs/scroll-horizons-thumbs-and-blocking.md#post-cleanup-campaign) owns evidence and limits. |
| Live infrastructure | [Infrastructure safeguards](exploration/docs/infra-safeguards.md). |
| Embedded browser | Read the [browser playbook](exploration/docs/embedded-browser-playbook.md) first, then task-relevant references. Record reusable lessons only, not routine outcomes or session narratives. |

## Keeping This Guide Useful

Change this file only when general onboarding, the system map or documentation
routing changes. Most tasks should leave it untouched.

Keep component mechanics in the component reference or owning design guide,
implementation history in the [changelog](exploration/docs/changelog.md), and task
status in the relevant workplan or session worklog. Do not add test totals, latest
run results, commit hashes, completed-repair narratives or next-task instructions.

Documentation can mix design intent, observed behaviour and historical evidence.
Check the relevant implementation and tests before relying on a behavioural claim;
an unarchived file is not automatically current. Archived material is historical
context, not the default starting point.