# Kupua - Agent Orientation

Read this at session start. It provides a durable mental model and routes to deeper
context, not a task queue or development history. The operator supplies the current
task and context in conversation.

Standing rules live in [Copilot instructions](../.github/copilot-instructions.md),
with a [human-readable copy](exploration/docs/00%20Architecture%20and%20philosophy/copilot-instructions-copy-for-humans.md).
Read them if they are not already loaded; this guide does not repeat them.

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
Vite builds the app; Vitest and Playwright provide tests.

| Area | Responsibility and entry point |
|---|---|
| Search and navigation | The URL represents search/detail state. [URL sync](src/hooks/useUrlSearchSync.ts) coordinates it with the search store; density is a separate per-tab preference. Table, Grid and Justified code loads upfront with the search route. Grid detail-entry handlers read latest query params without depending on image-only route identity, preserving retained-cell memoization. |
| Data access | [The DAL](src/dal/index.ts) selects an implementation of `ImageDataSource`: media-api or direct Elasticsearch. API mode constructs no ES datasource and leaves query defaults to media-api. Direct mode derives defaults from its CQL parser; remaining grammar differences live in KUP-011. Views work through the shared data boundary. |
| Search state | [Search store](src/stores/search-store.ts) owns the result buffer and query, seek, extension and restoration work. It publishes data and placement intent rather than scrolling the DOM. |
| View and position | [Data window](src/hooks/useDataWindow.ts) bridges the buffer and rendered list; fixed Grid/Table explicitly enable 400ms seek-mode backward lookahead, capped at one 200-image page. Justified/default retain threshold 50. [Scroll effects](src/hooks/useScrollEffects.ts) own viewport placement and geometry-valid velocity; navigation intent is separate from geometry validity. Views own physical scroll extents; coordinate mechanics vary by result-set size. |
| Thumbnail admission | [ImageGrid](src/components/ImageGrid.tsx) eagerly loads visible virtual rows plus two rows below in Grid and Justified; upper and remaining overscan stay lazy. Row-local context updates only the thumbnail. Fixed Grid keys preserve physical column slots through seeks. Passive cleanup releases detached incomplete thumbnail sources, leaving connected/completed elements alone. URL/quality and geometry ownership are unchanged; no separate observer or scheduler. Justified hides visual fallback text without removing alt accessibility. |
| Fields | [Field registry](src/lib/field-registry.tsx) supplies shared definitions for columns, sorting, filters and metadata. Display consumers use registered accessors/formatters directly; `getFieldRawValue` supplies raw text. Fixed-grid captions/tooltips share [date formatting](src/lib/format-grid-date.ts) with reused local-time Intl formatters. |
| Table content | [TableRowCells](src/components/TableRowCells.tsx) memoizes registry-based cells on stable image, columns and enrichment inputs; TanStack Row objects never cross the memoized row/content boundary. Placement, focus and selection stay in ImageTable; numeric fields reuse a default-locale formatter. Table thumbnails retain native lazy loading and release only detached incomplete sources; URL changes recapture conditionally mounted images without clearing connected consumers. |
| Selection | [Selection store](src/stores/selection-store.ts) owns multi-image membership independently of focus. |

For subsystem internals, start with the relevant section of the
[component reference](exploration/docs/00%20Architecture%20and%20philosophy/component-detail.md).
It is the detailed map, not compulsory reading in full.

## Read for the Task

Use the closest topic below, then follow its relevant code and documentation links.
There is no need to read the whole documentation tree before working.

| Topic | Start here |
|---|---|
| State ownership and lifetimes | [State management](exploration/docs/00%20Architecture%20and%20philosophy/state-management.md) for a compact engineer-facing overview of the current implementation. |
| Product intent and interaction design | [Frontend philosophy](exploration/docs/00%20Architecture%20and%20philosophy/01-frontend-philosophy.md) for intent; distinguish proposals and older implementation notes from current behaviour. |
| Scrolling, tiers and scrubber | [Scroll architecture](exploration/docs/00%20Architecture%20and%20philosophy/03-scroll-architecture.md) and [scrubber reference](exploration/docs/00%20Architecture%20and%20philosophy/scrubber-ticks-and-labels.md). |
| Thumbnail arrival, buffer-edge blocking and boundary stability | [Scroll continuity](exploration/docs/scroll-horizons-thumbs-and-blocking.md) owns the shipped Grid/Table B2 scope, the next one-upper-eager-row comparison, unresolved forward-recovery evidence, publication/retention mechanisms and separate runway/geometry/delivery questions. [Research evidence](exploration/docs/scroll-horizons-thumb-lookahead-results.json) preserves comparisons and exclusions. The upper row, Justified B2, retention, larger horizons and true-ratio fragments are not implemented product policies. |
| Focus, density and position preservation | [Focus and position guide](exploration/docs/00%20Architecture%20and%20philosophy/02-focus-and-position-preservation.md), [Justified geometry ownership](exploration/docs/00%20Architecture%20and%20philosophy/component-detail.md#justified-density-componentsjustifiedgridtsx-libwindowed-justified-layoutts) and [shared destination-seek policy](exploration/docs/00%20Architecture%20and%20philosophy/03-scroll-architecture.md#destination-seek-preparation). [Research and refactor candidates](exploration/docs/justified-density-prototype-plan.md) require separate approval. |
| URL and browser history | [History architecture](exploration/docs/00%20Architecture%20and%20philosophy/04-browser-history-architecture.md). |
| Selection and shared metadata | [Selections guide](exploration/docs/00%20Architecture%20and%20philosophy/05-selections.md) and [field catalogue](exploration/docs/00%20Architecture%20and%20philosophy/field-catalogue.md). |
| Detail, fullscreen, gestures, panels, CQL or data adapters | The relevant subsystem in the [component reference](exploration/docs/00%20Architecture%20and%20philosophy/component-detail.md). |
| Keyboard interaction | [Keyboard navigation](exploration/docs/00%20Architecture%20and%20philosophy/keyboard-navigation.md). |
| Collections | [Collections guide](exploration/docs/00%20Architecture%20and%20philosophy/06-collections.md). |
| AI search | [AI compatibility workplan](exploration/docs/ai-search-catching-up-workplan.md) for contracts and [component reference](exploration/docs/00%20Architecture%20and%20philosophy/component-detail.md) for implementation entry points. |
| Backend merges and future PRs | [Living impact checklist](exploration/docs/00-kupua-backend-merge-to-MAIN-impact-map.md): recheck and update relevant disclosure bullets for non-trivial shared-backend changes; no merge history. |
| API integration | [API build plan](exploration/docs/03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md) for sequence and decisions; [Scala conventions](exploration/docs/03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/media-api-91-instructions-for-agents.md) for media-api work; [request lifetime and optimisation parity](exploration/docs/api-request-lifetime-and-performance-parity.md) for KUP-041 and client/server repair boundaries. |
| Runtime configuration | [README setup](README.md#quick-start) for modes; [hosted server-configuration workplan](exploration/docs/kupua-TEST-deployment-01-config-via-server.md) for agreed scope, bootstrap/defaults and the next ticker-metadata slice. |
| Hosting by Kahuna and canonical media | [TEST hosting plan and architecture](exploration/docs/kupua-TEST-deployment-00-plan.md): delivery modes, hosted build, injected config contract, Kahuna serving and switch. |
| Known defects or intentional departures | [Bug backlog](exploration/docs/bug-backlog.md) and [deviations](exploration/docs/deviations.md). |

## Running and Validation

Start with the [README's Quick Start](README.md#quick-start) for local setup and
its API-mode sections when relevant. The entry point is [start.sh](scripts/start.sh).

Execution rules and required test surfaces belong to the standing directives.
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