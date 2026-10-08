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
| Search and navigation | The URL represents search/detail state. [URL sync](src/hooks/useUrlSearchSync.ts) coordinates it with the search store; density is a separate per-tab preference. |
| Data access | [The DAL](src/dal/index.ts) selects an implementation of `ImageDataSource`: media-api or direct Elasticsearch. API mode constructs no ES datasource. Views work through the shared data boundary. |
| Search state | [Search store](src/stores/search-store.ts) owns the result buffer and query, seek, extension and restoration work. It publishes data and placement intent rather than scrolling the DOM. |
| View and position | [Data window](src/hooks/useDataWindow.ts) bridges the buffer and rendered list; [scroll effects](src/hooks/useScrollEffects.ts) own viewport placement. Coordinate mechanics vary by result-set size. |
| Fields | [Field registry](src/lib/field-registry.tsx) supplies shared field definitions for columns, sorting, filters and metadata presentation. |
| Selection | [Selection store](src/stores/selection-store.ts) owns multi-image membership independently of focus. |

For subsystem internals, start with the relevant section of the
[component reference](exploration/docs/00%20Architecture%20and%20philosophy/component-detail.md).
It is the detailed map, not compulsory reading in full.

## Read for the Task

Use the closest topic below, then follow its relevant code and documentation links.
There is no need to read the whole documentation tree before working.

| Topic | Start here |
|---|---|
| Product intent and interaction design | [Frontend philosophy](exploration/docs/00%20Architecture%20and%20philosophy/01-frontend-philosophy.md) for intent; distinguish proposals and older implementation notes from current behaviour. |
| Scrolling, tiers and scrubber | [Scroll architecture](exploration/docs/00%20Architecture%20and%20philosophy/03-scroll-architecture.md) and [scrubber reference](exploration/docs/00%20Architecture%20and%20philosophy/scrubber-ticks-and-labels.md). |
| Focus, density and position preservation | [Focus and position guide](exploration/docs/00%20Architecture%20and%20philosophy/02-focus-and-position-preservation.md). |
| URL and browser history | [History architecture](exploration/docs/00%20Architecture%20and%20philosophy/04-browser-history-architecture.md). |
| Selection and shared metadata | [Selections guide](exploration/docs/00%20Architecture%20and%20philosophy/05-selections.md) and [field catalogue](exploration/docs/00%20Architecture%20and%20philosophy/field-catalogue.md). |
| Detail, fullscreen, gestures, panels, CQL or data adapters | The relevant subsystem in the [component reference](exploration/docs/00%20Architecture%20and%20philosophy/component-detail.md). |
| Keyboard interaction | [Keyboard navigation](exploration/docs/00%20Architecture%20and%20philosophy/keyboard-navigation.md). |
| Collections | [Collections guide](exploration/docs/00%20Architecture%20and%20philosophy/06-collections.md). |
| AI search | [AI compatibility workplan](exploration/docs/ai-search-catching-up-workplan.md) for contracts and [component reference](exploration/docs/00%20Architecture%20and%20philosophy/component-detail.md) for implementation entry points. |
| API integration | [API build plan](exploration/docs/03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md) for sequence and decisions; [Scala conventions](exploration/docs/03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/media-api-91-instructions-for-agents.md) for media-api work. |
| Runtime configuration | [Configuration and data sources](exploration/docs/runtime-configuration-and-data-sources.md). |
| Known defects or intentional departures | [Bug backlog](exploration/docs/bug-backlog.md) and [deviations](exploration/docs/deviations.md). |

## Running and Validation

Start with the [README's Quick Start](README.md#quick-start) for local setup and
its API-mode sections when relevant. The entry point is [start.sh](scripts/start.sh).

Execution rules and required test surfaces belong to the standing directives.
For task-specific details:

| Need | Reference |
|---|---|
| Test setup and commands | [Test modes](e2e/README.md#test-modes), [command selection](e2e/README.md#which-command-do-i-run) and [npm scripts](package.json). |
| Test changes | [Testing guide](e2e/README.md), including applicable fixture and proof contracts. |
| Performance measurements | [Performance handbook](e2e-perf/README.md), including existing results and measurement limits. |
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