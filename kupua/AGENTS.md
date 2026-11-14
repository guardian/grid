# Kupua - Agent Orientation

**Most tasks must leave this file unchanged.** Update it only when a future agent
needs a different project mental model, ownership map or documentation entry point.
A completed implementation, fix or validation run is not itself a reason to edit it.
Keep entries to responsibility, essential boundary and a link; update existing
entries rather than appending accomplishments. Put mechanics in the owning guide,
implementation history in the [changelog](exploration/docs/changelog.md), and
temporary status in the worklog. Do not add tuning constants, test totals, latest
run results, commit hashes, completed-repair narratives or next-task instructions.

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
Table and Virtual handle routing and list presentation. Styling uses Tailwind.
Vite builds the app; Vitest and Playwright provide tests.

Hosted Kupua is the future application and is API-only. Direct-ES remains temporary
laptop support, intended for separately authorized removal, never a fallback for
API failure or missing hosted configuration. Keep the shell usable on failure,
but distinguish required-data errors from empty results and optional absence;
do not add alternate data paths to hide failures. The standing data-mode directive
owns this policy; the [API contract](src/dal/grid-api/README.md) describes current behavior.

| Area | Responsibility and entry point |
|---|---|
| Search and navigation | [URL sync](src/hooks/useUrlSearchSync.ts) coordinates URL search/detail state with the search store; density is a separate per-tab preference. |
| Data access | [The DAL](src/dal/index.ts) selects the `ImageDataSource` for the explicit data mode. Views use this shared boundary; API mode constructs no ES datasource. |
| Mutation boundary | [Grid commands](src/lib/grid-commands.ts) own default-off label writes, separate from reads. The [API contract](src/dal/grid-api/README.md#step-2-command-boundary) owns validation, outcomes and deployment limits. |
| Label editing | [LabelEditor](src/components/LabelEditor.tsx) owns controls; the [editor store](src/stores/label-editor-store.ts) holds drafts and receipts independently of selection. [Label operations](src/lib/label-operation.ts) coordinate immutable targets and publication. |
| Search state | [Search store](src/stores/search-store.ts) owns the buffer, queries, seeks, extension and restoration. Display coordinates and raw cursors are distinct from current rank. |
| View and position | [Data window](src/hooks/useDataWindow.ts) bridges buffer and rendering; [scroll effects](src/hooks/useScrollEffects.ts) own viewport placement. Views own physical scroll extents; coordinate mechanics vary by result-set size. |
| Thumbnail admission | [ImageGrid](src/components/ImageGrid.tsx) owns Grid/Justified thumbnail loading and resource lifetime. Admission, delivery and geometry are separate concerns. |
| Fields | [Field registry](src/lib/field-registry.tsx) supplies shared definitions for columns, sorting, filters and metadata. |
| Table content | [TableRowCells](src/components/TableRowCells.tsx) renders registry-based cells; placement, focus and selection stay in ImageTable. |
| Selection | [Selection store](src/stores/selection-store.ts) owns multi-image membership independently of focus and editing drafts. |
| Crop editor | [CropEditor](src/components/crop/CropEditor.tsx) and [CropCanvas](src/components/crop/CropCanvas.tsx) own a read-only Cropper.js v2 editor inside detail. Crop builds a request without sending it. |
| Shell and zoom | [Shell](src/hooks/useShell.ts) selects compact or desktop chrome over one engine. [Results zoom](src/lib/results-zoom.ts) and the [zoom store](src/stores/zoom-store.ts) own density levels; zoom anchoring is distinct from focus and selection. |

For subsystem internals, start with the relevant section of the
[component reference](exploration/docs/00%20Architecture%20and%20philosophy/component-detail.md).
It is the detailed map, not compulsory reading in full.

## Read for the Task

Use the closest topic below, then follow its relevant code and documentation links.
There is no need to read the whole documentation tree before working.

Documentation can mix design intent, observed behaviour and historical evidence.
Check relevant implementation and tests before relying on a behavioural claim;
an unarchived file is not automatically current. Archived material is historical
context, not the default starting point.

| Topic | Start here |
|---|---|
| State ownership and lifetimes | [State management](exploration/docs/00%20Architecture%20and%20philosophy/state-management.md) for a compact engineer-facing overview of the current implementation. |
| Product intent and interaction design | [Frontend philosophy](exploration/docs/00%20Architecture%20and%20philosophy/01-frontend-philosophy.md) for intent; distinguish proposals and older implementation notes from current behaviour. |
| Scrolling, tiers and scrubber | [Scroll architecture](exploration/docs/00%20Architecture%20and%20philosophy/03-scroll-architecture.md) and [scrubber reference](exploration/docs/00%20Architecture%20and%20philosophy/scrubber-ticks-and-labels.md). |
| Thumbnail arrival, buffer-edge blocking and boundary stability | [Scroll continuity](exploration/docs/scroll-horizons-thumbs-and-blocking.md) distinguishes shipped policies, proposals and unresolved questions; [research evidence](exploration/docs/scroll-horizons-thumb-lookahead-results.json) holds comparisons and exclusions. |
| Focus, density and position preservation | [Focus and position guide](exploration/docs/00%20Architecture%20and%20philosophy/02-focus-and-position-preservation.md), [target choosers](src/lib/layout-anchor-policy.ts), [Justified geometry](exploration/docs/00%20Architecture%20and%20philosophy/component-detail.md#justified-density-componentsjustifiedgridtsx-libwindowed-justified-layoutts) and [destination-seek policy](exploration/docs/00%20Architecture%20and%20philosophy/03-scroll-architecture.md#destination-seek-preparation). |
| URL and browser history | [History architecture](exploration/docs/00%20Architecture%20and%20philosophy/04-browser-history-architecture.md) for detail-entry guards and browser-specific native Back limits. |
| Selection and shared metadata | [Selections guide](exploration/docs/00%20Architecture%20and%20philosophy/05-selections.md) and [field catalogue](exploration/docs/00%20Architecture%20and%20philosophy/field-catalogue.md). |
| Editing prerequisites and Kahuna parity | [Editing plan](exploration/docs/gradually-growing-teeth.kupua-edits-steps.md) for scope and gates; [publication plan](exploration/docs/gradually-growing-teeth.step-4-publication-plan.md) for the publication contract. [Image publication](src/lib/image-publication.ts) and [read freshness](src/lib/image-read-freshness.ts) own delivery and stale-read protection. |
| Detail, fullscreen, gestures, panels or data adapters | The relevant subsystem in the [component reference](exploration/docs/00%20Architecture%20and%20philosophy/component-detail.md). |
| CQL editing and suggestions | [CQL integration](exploration/docs/00%20Architecture%20and%20philosophy/component-detail.md#cql) and [deviations](exploration/docs/deviations.md) describe upstream versus local responsibilities. |
| Query and label suggestions | [Better suggestions](exploration/docs/better-suggestions-aggregation-endpoint-enhancement.md) separates current behaviour from proposed backend enhancements. |
| Keyboard interaction | [Keyboard navigation](exploration/docs/00%20Architecture%20and%20philosophy/keyboard-navigation.md). |
| Phone layout, sheets, touch gestures and results zoom | [Compact shell](exploration/docs/00%20Architecture%20and%20philosophy/component-detail.md#compact-shell-hooksuseshellts-componentsbottomsheettsx-componentsfilterssheettsx) and [results zoom](exploration/docs/00%20Architecture%20and%20philosophy/component-detail.md#results-zoom-libresults-zoomts-storeszoom-storets) in the component reference. [Editing UI decisions](exploration/docs/gradually-growing-teeth.editing-ui-decisions.md) distinguish implemented metadata controls from disconnected saves and deferred badge design. |
| Collections | [Collections guide](exploration/docs/00%20Architecture%20and%20philosophy/06-collections.md). |
| AI search | [AI compatibility workplan](exploration/docs/ai-search-catching-up-workplan.md) for contracts and [component reference](exploration/docs/00%20Architecture%20and%20philosophy/component-detail.md) for implementation entry points. |
| Backend merges and future PRs | [Living impact checklist](exploration/docs/00-kupua-backend-merge-to-MAIN-impact-map.md): recheck and update relevant disclosure bullets for non-trivial shared-backend changes; no merge history. |
| API integration | [API build plan](exploration/docs/03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md) for sequence and decisions; [Scala conventions](exploration/docs/03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/media-api-91-instructions-for-agents.md) for media-api work; [request lifetime and optimisation parity](exploration/docs/api-request-lifetime-and-performance-parity.md) for KUP-041 and client/server repair boundaries. |
| Hosted rights, notices and capabilities | [Shared API contract](src/dal/grid-api/README.md) for capabilities and session data; [rights review](exploration/docs/hosted-rights-and-capabilities-review.md) for display findings and deferred scope. |
| Runtime configuration and hosting by Kahuna | [README setup](README.md#quick-start) for laptop modes and startup; [Deployed via Kahuna](exploration/docs/00%20Architecture%20and%20philosophy/09-deployed-via-Kahuna.md) for built assets, injected config and server-owned data. |
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
| Performance measurements | [Operator guide](e2e-perf/README.md) for execution; [measurement contracts](e2e-perf/measurement-reference.md), [validation](e2e-perf/validation/README.md), [research](e2e-perf/research/README.md) and [coverage/runtime](exploration/docs/scroll-horizons-thumbs-and-blocking.md#active-pressure-campaign) for evidence and limits. |
| Intermittent transport failures | [Evidence and reinstatement/capture/rollback runbook](exploration/experiments/es-transport/README.md); [earlier DNS/PP3 evidence](exploration/experiments/es-transport/earlier-e2e-perf-failures.md). |
| Thumbnail request ownership | [Delivery options](exploration/docs/scroll-horizons-thumbs-and-blocking.md#delivery-options-decision) for cleanup/admission policy; [campaign interpretation](exploration/docs/scroll-horizons-thumbs-and-blocking.md#post-cleanup-campaign) for evidence and limits. |
| Live infrastructure | [Infrastructure safeguards](exploration/docs/infra-safeguards.md). |
| Embedded browser | Read the [browser playbook](exploration/docs/embedded-browser-playbook.md) first; [mobile performance](exploration/docs/browser-playbook/mobile-performance.md) and the [Android Chrome research kit](e2e-perf/research/mobile-perf-measurement/README.md) cover phone tracing and analysis. |