# Kupua Docs Inventory — 7 May 2026

> Snapshot taken 2026-05-07 by a fresh Sonnet agent executing the
> `docs-inventory-handoff.md` brief.
> **Read-only.** No edits, no deletions, no commits.

---

## Section 0 — Volume Deviation

**Total files found: 114** (handoff expected ≤80; brief says "stop and
double-check if >80"). Double-check performed: `find` output confirmed.
The excess is caused by a nested subdirectory **`zz Archive/Scrolling
bonanza/`** (19 files) not anticipated in the handoff's folder taxonomy.
The framing is otherwise valid — no fundamental mismatch. Proceeding with
a 6th bucket **`zz-archive-scroll`** for those files. Folder buckets used:

| Bucket | Folder |
|---|---|
| `00-arch` | `00 Architecture and philosophy/` |
| `01-research` | `01 Research/` |
| `03-future` | `03 Ce n'est pas une pipe dream/` |
| `root` | docs root (loose files) |
| `zz-archive` | `zz Archive/` (top-level only) |
| `zz-archive-scroll` | `zz Archive/Scrolling bonanza/` |

---

## Inventory Table

| Path | Folder | Prefix | Lines | Created (git) | Last-mod (git) | Last-mod (mtime) | Doc type | Topic | Audience | Apparent status | Lift (archive) | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `kupua/exploration/docs/00 Architecture and philosophy/00-kupua-extracted-principles.md` | `00-arch` | kupua | 54 | 2026-04-03 | 2026-04-05 | 2026-04-29 | living-reference | core principles | both | canonical | — | Concise distillation of design philosophy and arch principles. Referenced implicitly by most other arch docs. |
| `kupua/exploration/docs/00 Architecture and philosophy/01-frontend-philosophy.md` | `00-arch` | frontend | 377 | 2026-03-23 | 2026-04-18 | 2026-04-29 | living-reference | frontend philosophy | both | canonical | — | Long-form philosophy doc; predates most of the system. Still authoritative. |
| `kupua/exploration/docs/00 Architecture and philosophy/02-focus-and-position-preservation.md` | `00-arch` | focus | 319 | 2026-04-18 | 2026-04-18 | 2026-04-29 | living-reference | focus/position arch | both | canonical | — | Architecture of phantom-focus, position preservation. Companion: `zz Archive/focus-position-preservation-workplan.md`. |
| `kupua/exploration/docs/00 Architecture and philosophy/03-scroll-architecture.md` | `00-arch` | scroll | 848 | 2026-04-05 | 2026-04-23 | 2026-04-29 | living-reference | scroll architecture | both | canonical | — | Main scroll arch reference. overlaps-with: `root/scroll-audit.md` (audit of same system). |
| `kupua/exploration/docs/00 Architecture and philosophy/04-browser-history-architecture.md` | `00-arch` | browser | 363 | 2026-04-26 | 2026-04-28 | 2026-04-29 | living-reference | browser history | both | canonical | — | Post-rearchitecture reference. Supersedes `zz Archive/browser-history-workplan.md` as the authoritative doc. |
| `kupua/exploration/docs/00 Architecture and philosophy/05-selections.md` | `00-arch` | selections | 454 | 2026-05-01 | 2026-05-04 | 2026-05-04 | living-reference | selections arch | both | canonical | — | Architecture for multi-image selections feature (v1). mtime≈gitmod (written just before commit). |
| `kupua/exploration/docs/00 Architecture and philosophy/component-detail.md` | `00-arch` | component | 162 | 2026-04-07 | 2026-04-23 | 2026-04-29 | living-reference | component overview | agent | canonical | — | Detailed component-by-component reference; overflow from AGENTS.md. |
| `kupua/exploration/docs/00 Architecture and philosophy/copilot-instructions-copy-for-humans.md` | `00-arch` | copilot | 132 | 2026-03-28 | 2026-05-04 | 2026-05-04 | living-reference | agent directives | both | canonical | — | Mirror of `.github/copilot-instructions.md`. Per directive-sync rule, must stay identical to that file. |
| `kupua/exploration/docs/00 Architecture and philosophy/field-catalogue.md` | `00-arch` | field | 312 | 2026-05-03 | 2026-05-03 | 2026-05-02 | living-reference | field parity | both | canonical | — | Authoritative 46-field reference for Kahuna/Kupua display parity. mtime 1 day before gitmod (file written before commit). |
| `kupua/exploration/docs/00 Architecture and philosophy/keyboard-navigation.md` | `00-arch` | keyboard | 359 | 2026-04-07 | 2026-05-01 | 2026-04-29 | living-reference | keyboard nav | both | canonical | — | Focus modes, page-scroll math, arrow key behaviour. |
| `kupua/exploration/docs/00 Architecture and philosophy/s3-proxy.md` | `00-arch` | s3 | 167 | 2026-03-22 | 2026-04-06 | 2026-04-29 | living-reference | S3 proxy | agent | stale-suspected | — | Doc is marked "Temporary Phase 1–2 solution"; codebase has since moved to Phase 3+ with media-api integration. May no longer reflect current dev setup. |
| `kupua/exploration/docs/00 Architecture and philosophy/scrubber-ticks-and-labels.md` | `00-arch` | scrubber | 314 | 2026-04-04 | 2026-04-05 | 2026-04-29 | living-reference | scrubber math | both | canonical | — | Coordinate system, null-zone rendering, tick/label design. overlaps-with: `zz-archive-scroll/scrubber-dual-mode-ideation.md` (older ideation). |
| `kupua/exploration/docs/00 Architecture and philosophy/tuning-knobs.md` | `00-arch` | tuning | 607 | 2026-04-01 | 2026-04-23 | 2026-04-29 | living-reference | tuning constants | both | canonical | — | Master reference for every configurable constant. Cross-references `constants/tuning.ts`. |
| `kupua/exploration/docs/01 Research/00-kahuna-service-communication-audit.md` | `01-research` | kahuna | 606 | 2026-04-03 | 2026-04-05 | 2026-04-29 | research-artefact | Kahuna service comms | both | canonical | — | Audit of Kahuna's service-communication patterns. overlaps-with: `01-research/grid-api-contract-audit-findings.md` (different scope: service vs API contract). |
| `kupua/exploration/docs/01 Research/dashboard-density-ideation.md` | `01-research` | dashboard | 258 | 2026-04-09 | 2026-04-09 | 2026-04-29 | research-artefact | dashboard density | both | canonical | — | Ideation for "dashboard" density with statistical visualisations. No implementation started. |
| `kupua/exploration/docs/01 Research/grid-api-contract-audit-findings.md` | `01-research` | grid | 2360 | 2026-04-30 | 2026-05-04 | 2026-05-03 | research-artefact | Grid API contract | agent | canonical | — | Large (2360 lines) audit of media-api response shapes and contract. mtime slightly before gitmod (written before commit). |
| `kupua/exploration/docs/01 Research/image-optimisation-research.md` | `01-research` | image | 700 | 2026-04-02 | 2026-04-05 | 2026-04-29 | research-artefact | image format/size | both | canonical | — | AVIF format selection, DPR-aware sizing, imgproxy tuning findings. |
| `kupua/exploration/docs/01 Research/imgproxy-research.md` | `01-research` | imgproxy | 265 | 2026-03-22 | 2026-04-05 | 2026-04-29 | research-artefact | imgproxy setup | both | canonical | — | imgproxy configuration, URL signing, image pipeline. |
| `kupua/exploration/docs/01 Research/kahuna-app-wide-ui-constants.md` | `01-research` | kahuna | 150 | 2026-05-04 | 2026-05-04 | 2026-05-04 | research-artefact | Kahuna UI constants | agent | canonical | — | Kahuna-side UI constants for use in Kupua parity work. mtime slightly before gitmod. |
| `kupua/exploration/docs/01 Research/kahuna-image-detail-inventory.md` | `01-research` | kahuna | 270 | 2026-05-04 | 2026-05-04 | 2026-05-03 | research-artefact | Kahuna image detail | agent | canonical | — | Inventory of Kahuna's image-detail UI for Kupua feature parity. |
| `kupua/exploration/docs/01 Research/kahuna-scroll-analysis.md` | `01-research` | kahuna | 210 | 2026-03-23 | 2026-04-05 | 2026-04-29 | research-artefact | Kahuna scroll | both | canonical | — | Early analysis of Kahuna's scroll behaviour; informed kupua scroll design. |
| `kupua/exploration/docs/01 Research/labels-kahuna-findings.md` | `01-research` | labels | 483 | 2026-05-04 | 2026-05-04 | 2026-05-03 | research-artefact | Kahuna labels | agent | canonical | — | Audit of Kahuna's label feature (chip UI, metadata-editor API, Kinesis propagation). |
| `kupua/exploration/docs/01 Research/media-api-enrichment-strategy-findings.md` | `01-research` | media | 228 | untracked | untracked | 2026-05-07 | research-artefact | API enrichment strategy | agent | canonical | — | Deliverable from `root/bulk-fetch-feasibility-handoff.md`. Untracked (created today, not yet committed). |
| `kupua/exploration/docs/01 Research/scroll-consolidation-and-signals-plan.md` | `01-research` | scroll | 491 | 2026-04-01 | 2026-04-17 | 2026-04-29 | plan | scroll consolidation | agent | stale-suspected | — | Content is a *plan* (wrong folder — belongs in `03 Ce…/`). Part A complete as of writing; Part B (Signals spike) was "next" in April — never executed per changelog. overlaps-with: `00-arch/03-scroll-architecture.md`. |
| `kupua/exploration/docs/01 Research/scrubber-nonlinear-research.md` | `01-research` | scrubber | 369 | 2026-03-28 | 2026-04-05 | 2026-04-29 | research-artefact | scrubber nonlinear | both | canonical | — | Research on non-linear (logarithmic/exponential) scrubber scale. |
| `kupua/exploration/docs/01 Research/selections-kahuna-findings.md` | `01-research` | selections | 657 | 2026-05-01 | 2026-05-03 | 2026-05-03 | research-artefact | Kahuna selections | agent | canonical | — | Kahuna selection-state architecture, ~500-item perf, drag/drop. overlaps-with: `selections-kahuna-pills-location-leases-findings.md` (companion; §2.6 superseded by the pills doc). |
| `kupua/exploration/docs/01 Research/selections-kahuna-pills-location-leases-findings.md` | `01-research` | selections | 641 | 2026-05-03 | 2026-05-03 | 2026-05-03 | research-artefact | Kahuna pills/leases | agent | canonical | — | Per-field UI catalogue for chips, location, leases in multi-select. Supersedes §2.6 of `selections-kahuna-findings.md`. |
| `kupua/exploration/docs/03 Ce n'est pas une pipe dream/integration-plan-api-first.md` | `03-future` | integration | 1078 | 2026-04-17 | 2026-04-17 | 2026-04-29 | plan | API-first integration | both | canonical | — | Long-form architecture reference for HATEOAS/API-first approach. `integration-workplan-bread-and-butter.md` is its practical companion. |
| `kupua/exploration/docs/03 Ce n'est pas une pipe dream/integration-plan.md` | `03-future` | integration | 266 | 2026-04-17 | 2026-04-17 | 2026-04-29 | plan | direct-ES integration | both | superseded | — | The direct-ES alternative plan (zero media-api changes). API-first hybrid was chosen instead. superseded-by: `integration-workplan-bread-and-butter.md`. |
| `kupua/exploration/docs/03 Ce n'est pas une pipe dream/integration-workplan-bread-and-butter.md` | `03-future` | integration | 1112 | 2026-04-28 | 2026-05-04 | 2026-05-07 | plan | practical workplan | both | canonical | — | Active workplan for Phase 0 + API-first hybrid. **mtime 3 days after gitmod (2026-05-07 vs 2026-05-04) — likely uncommitted edits.** |
| `kupua/exploration/docs/03 Ce n'est pas une pipe dream/kupua-00-capabilities-report.md` | `03-future` | kupua | 981 | 2026-04-03 | 2026-04-17 | 2026-04-29 | research-artefact | capabilities state | both | stale-suspected | — | Snapshot of kupua state at 2 April 2026. 5+ weeks of feature work since then. Likely outdated for most sections. |
| `kupua/exploration/docs/03 Ce n'est pas une pipe dream/kupua-01-refactoring-assessment.md` | `03-future` | kupua | 506 | 2026-04-03 | 2026-04-17 | 2026-04-29 | research-artefact | refactor assessment | both | superseded | — | Refactoring assessment from April 2026; the recommended work was executed via `kupua-05`. superseded-by: `kupua-05-realistic-work-plan.md` (which drove actual execution). |
| `kupua/exploration/docs/03 Ce n'est pas une pipe dream/kupua-02-structural-audit.md` | `03-future` | kupua | 799 | 2026-04-03 | 2026-04-17 | 2026-04-29 | research-artefact | structural audit | both | canonical | — | The definitive structural audit. `zz Archive/structural-audit-assessment.md` is a gap-analysis of this doc. |
| `kupua/exploration/docs/03 Ce n'est pas une pipe dream/kupua-03-structural-rearchitecture.md` | `03-future` | kupua | 893 | 2026-04-03 | 2026-04-17 | 2026-04-29 | plan | structural rearchitecture | both | superseded | — | Full 5-phase rearchitecture proposal, explicitly superseded by `kupua-05-realistic-work-plan.md` (which refused most of its recommendations). superseded-by: `kupua-05-realistic-work-plan.md`. |
| `kupua/exploration/docs/03 Ce n'est pas une pipe dream/kupua-04-structural-work-plan.md` | `03-future` | kupua | 787 | 2026-04-03 | 2026-04-17 | 2026-04-29 | plan | structural work plan | both | superseded | — | Team-scale work plan; explicitly superseded by `kupua-05-realistic-work-plan.md` ("that's not what's happening"). superseded-by: `kupua-05-realistic-work-plan.md`. |
| `kupua/exploration/docs/03 Ce n'est pas une pipe dream/kupua-05-realistic-work-plan.md` | `03-future` | kupua | 972 | 2026-04-03 | 2026-04-17 | 2026-04-29 | plan | realistic work plan | both | stale-suspected | — | The plan that was actually executed (three sessions, safe subset). Implemented in April; now past-tense. Still valuable as rationale for the chosen approach. |
| `kupua/exploration/docs/03 Ce n'est pas une pipe dream/scroll-00-stability-audit.md` | `03-future` | scroll | 156 | 2026-04-06 | 2026-04-17 | 2026-04-29 | research-artefact | scroll stability | both | superseded | — | First scroll stability assessment (honest appraisal of agents 5–13 work). superseded-by: `scroll-01-stability-audit-realistic.md` (revised in context of `kupua-05`). |
| `kupua/exploration/docs/03 Ce n'est pas une pipe dream/scroll-01-stability-audit-realistic.md` | `03-future` | scroll | 89 | 2026-04-06 | 2026-04-17 | 2026-04-29 | research-artefact | scroll stability | both | canonical | — | Revised scroll assessment; accepts the prototype context that `scroll-00` missed. overlaps-with: `scroll-00` (same topic, this one is canonical). |
| `kupua/exploration/docs/03 Ce n'est pas une pipe dream/zz-this-pig-no-fly-mate.md` | `03-future` | zz | 125 | 2026-04-25 | 2026-04-25 | 2026-04-29 | research-artefact | reuse feasibility | both | canonical | — | Honest analysis of why generalising kupua into reusable libs is not the right unit of reuse. Self-contained; no superseder. |
| `kupua/exploration/docs/bulk-fetch-feasibility-handoff.md` | `root` | bulk-fetch | 326 | untracked | untracked | 2026-05-07 | handoff | media-api enrichment | agent | done-handoff | — | Filename is a misnomer (started as bulk-fetch, reframed to API enrichment strategy). Deliverable was `01 Research/media-api-enrichment-strategy-findings.md` (created today). Untracked. |
| `kupua/exploration/docs/changelog.md` | `root` | changelog | 7264 | 2026-03-28 | 2026-05-06 | 2026-05-06 | changelog | project changelog | both | canonical | — | Append-only history. One of two files in the docs root that must never be deleted. |
| `kupua/exploration/docs/deviations.md` | `root` | deviations | 1252 | 2026-03-22 | 2026-05-03 | 2026-05-03 | living-reference | codebase deviations | agent | canonical | — | Every intentional departure from library defaults or Grid/Kahuna behaviour. Referenced from `copilot-instructions.md`. |
| `kupua/exploration/docs/docs-inventory-handoff.md` | `root` | docs | 296 | untracked | untracked | 2026-05-07 | handoff | docs inventory | agent | done-handoff | — | This brief; being executed right now. Untracked. Deliverable is this inventory file. |
| `kupua/exploration/docs/es-audit.md` | `root` | es | 399 | 2026-04-04 | 2026-04-04 | 2026-04-29 | research-artefact | ES usage audit | agent | canonical | — | 9-issue ES usage audit; findings marked ✅ FIXED inline as work was done. Serves as running ES-safety record. |
| `kupua/exploration/docs/infra-safeguards.md` | `root` | infra | 372 | 2026-03-22 | 2026-05-04 | 2026-05-03 | living-reference | infra safety | both | canonical | — | Safeguards framework for TEST/CODE/PROD clusters. Referenced in `copilot-instructions.md`. mtime slightly before gitmod. |
| `kupua/exploration/docs/mapping-enhancements.md` | `root` | mapping | 649 | 2026-03-22 | 2026-04-23 | 2026-04-29 | plan | ES mapping changes | both | canonical | — | Backlog plan for ES mapping changes requiring Grid-wide re-index. Notes kupua coupling to `field-registry.ts`. |
| `kupua/exploration/docs/migration-plan.md` | `root` | migration | 839 | 2026-03-22 | 2026-03-26 | 2026-04-29 | plan | Grid migration | both | superseded | — | Original March 2026 high-level migration plan (Status: Draft). superseded-by: `03/integration-workplan-bread-and-butter.md` (the practical successor). overlaps-with: `03/integration-plan-api-first.md`. |
| `kupua/exploration/docs/position-preservation-reference.md` | `root` | position | 106 | 2026-04-27 | 2026-04-28 | 2026-04-29 | living-reference | focus/position | agent | canonical | — | Distilled from the rearchitecture audit; preserves `focusedImageId` consumer survey (84 sites) and flash-site inventory. References killed `zz Archive/position-preservation-rearchitecture-handoff.md`. |
| `kupua/exploration/docs/scroll-audit.md` | `root` | scroll | 1557 | 2026-04-24 | 2026-04-24 | 2026-04-29 | research-artefact | scroll system audit | agent | canonical | — | Comprehensive read-only audit of the scroll stack (1557 lines). overlaps-with: `00-arch/03-scroll-architecture.md` (architecture vs audit of same system). |
| `kupua/exploration/docs/search-after-plan.md` | `root` | search | 2191 | 2026-03-28 | 2026-03-29 | 2026-04-29 | plan | search_after pagination | agent | stale-suspected | — | March 2026 implementation plan for search_after windowed scroll. Implementation is complete; architecture captured in `00-arch/03-scroll-architecture.md` and `changelog.md`. Inline status header is partially updated but the 2191-line doc has not been archived. overlaps-with: `00-arch/03-scroll-architecture.md`. |
| `kupua/exploration/docs/touch-gestures-hardening-plan.md` | `root` | touch | 246 | 2026-04-23 | 2026-04-23 | 2026-04-29 | plan | touch gesture hardening | agent | canonical | — | Backlog plan explicitly marked "not started". Scope: refactor 3 touch hooks to make bug class structurally impossible. overlaps-with: `zz Archive/swipe-carousel-review.md` (related mobile/touch context). |
| `kupua/exploration/docs/worklog-current.md` | `root` | worklog | 21 | 2026-04-07 | 2026-05-04 | 2026-05-04 | worklog | current task | agent | canonical | — | Per-session working notes. Should be exactly one; is exactly one. 21 lines = fresh (content moved to changelog after last task). |
| `kupua/exploration/docs/zz Archive/audit-history-back-forward-back-forward-bug.md` | `zz-archive` | audit | 182 | 2026-04-29 | 2026-04-29 | 2026-04-29 | research-artefact | back-forward bug | agent | archive-current | N | Bug investigation and root-cause analysis for back-forward-back-forward navigation issue. Archived post-fix. |
| `kupua/exploration/docs/zz Archive/browser-history-audit-handoff.md` | `zz-archive` | browser | 123 | 2026-04-25 | 2026-04-26 | 2026-04-29 | handoff | browser history audit | agent | done-handoff | N | Handoff brief for browser history audit. Output in `browser-history-audit-output.md`. changelog evidence exists (browser history arc). |
| `kupua/exploration/docs/zz Archive/browser-history-audit-output.md` | `zz-archive` | browser | 374 | 2026-04-26 | 2026-04-26 | 2026-04-29 | research-artefact | browser history audit | agent | archive-current | N | Audit findings output from `browser-history-audit-handoff.md`. |
| `kupua/exploration/docs/zz Archive/browser-history-baseline-tightening-handoff.md` | `zz-archive` | browser | 197 | 2026-04-25 | 2026-04-26 | 2026-04-29 | handoff | browser history tests | agent | done-handoff | N | Handoff for tightening browser history tests. Work executed; canonical reference is `00-arch/04-browser-history-architecture.md`. |
| `kupua/exploration/docs/zz Archive/browser-history-code-review.md` | `zz-archive` | browser | 448 | 2026-04-26 | 2026-04-26 | 2026-04-29 | research-artefact | browser history review | agent | archive-current | N | Code review of browser history implementation. |
| `kupua/exploration/docs/zz Archive/browser-history-future-polish-handoff.md` | `zz-archive` | browser | 731 | 2026-04-26 | 2026-04-26 | 2026-04-29 | handoff | browser history polish | agent | done-handoff | N | Polish handoff for browser history work. Feature complete, superseded by `00-arch/04-browser-history-architecture.md`. |
| `kupua/exploration/docs/zz Archive/browser-history-workplan.md` | `zz-archive` | browser | 173 | 2026-04-26 | 2026-04-26 | 2026-04-29 | plan | browser history plan | agent | archive-current | N | Implementation plan for browser history; work complete. |
| `kupua/exploration/docs/zz Archive/bug-hunt-audit-findings.md` | `zz-archive` | bug | 273 | 2026-04-28 | 2026-04-29 | 2026-04-29 | research-artefact | bug hunt findings | agent | archive-current | N | Bug-hunt audit output. Batch A complete (4 bugs fixed); Bug #9 fixed in Batch B. Some bugs may still be open — not verified. |
| `kupua/exploration/docs/zz Archive/bug-hunt-audit-handoff.md` | `zz-archive` | bug | 261 | 2026-04-28 | 2026-04-29 | 2026-04-29 | handoff | bug hunt | agent | done-handoff | N | Handoff brief for the bug-hunt audit. Findings in `bug-hunt-audit-findings.md`. |
| `kupua/exploration/docs/zz Archive/code-quality-audit-2026-04-09.md` | `zz-archive` | code | 201 | 2026-04-09 | 2026-04-09 | 2026-04-29 | research-artefact | code quality audit | both | archive-current | N | Code quality audit from 9 April 2026. Notable for explicit "do NOT split files" recommendation. |
| `kupua/exploration/docs/zz Archive/core-files-review-2026-04-19.md` | `zz-archive` | core | 634 | 2026-04-19 | 2026-04-19 | 2026-04-29 | research-artefact | core files review | agent | archive-current | N | Deep review of 5 core files (search-store, useScrollEffects, useDataWindow, useListNavigation, Scrubber). 19 April 2026. |
| `kupua/exploration/docs/zz Archive/dead-code-audit-findings.md` | `zz-archive` | dead | 379 | 2026-04-30 | 2026-05-01 | 2026-04-30 | research-artefact | dead code audit | agent | archive-current | N | Dead code audit (tsc + knip). Some items may not yet be acted on. mtime slightly before gitmod. |
| `kupua/exploration/docs/zz Archive/density-focus-drift-handover.md` | `zz-archive` | density | 360 | 2026-04-01 | 2026-04-07 | 2026-04-29 | handoff | density/focus work | agent | done-handoff | N | Multi-session handover for density + focus drift work. Work executed in early April 2026. |
| `kupua/exploration/docs/zz Archive/DISASTAH-NOT-PERF.md` | `zz-archive` | DISASTAH | 276 | 2026-03-31 | 2026-04-07 | 2026-04-29 | research-artefact | perf misdiagnosis | both | archive-current | N | Investigation revealing a "performance issue" was actually a rendering/UX bug, not a perf regression. Historical. |
| `kupua/exploration/docs/zz Archive/fix-ui-coupling-fix-handoff.md` | `zz-archive` | fix | 518 | 2026-03-30 | 2026-04-07 | 2026-04-29 | handoff | UI coupling fix | agent | done-handoff | N | Handoff for fixing UI coupling. Work executed. overlaps-with: `zz-archive-scroll/fix-ui-coupling-plan.md`. |
| `kupua/exploration/docs/zz Archive/fix-ui-coupling.md` | `zz-archive` | fix | 397 | 2026-03-30 | 2026-04-07 | 2026-04-29 | research-artefact | UI coupling analysis | agent | archive-current | N | Analysis of UI coupling issues pre-fix. overlaps-with: `fix-ui-docs-eval.md`, `fix-ui-coupling-fix-handoff.md`. |
| `kupua/exploration/docs/zz Archive/fix-ui-docs-eval.md` | `zz-archive` | fix | 507 | 2026-03-30 | 2026-04-07 | 2026-04-29 | research-artefact | UI coupling eval | agent | archive-current | N | Evaluation of docs/alternatives for UI coupling fix. overlaps-with: `fix-ui-coupling.md`, `fix-ui-coupling-fix-handoff.md`. |
| `kupua/exploration/docs/zz Archive/focus-mode-test-impact-report.md` | `zz-archive` | focus | 210 | 2026-04-20 | 2026-04-20 | 2026-04-29 | research-artefact | focus mode tests | agent | archive-current | N | Test impact report for focus mode changes. |
| `kupua/exploration/docs/zz Archive/focus-position-preservation-workplan.md` | `zz-archive` | focus | 562 | 2026-04-18 | 2026-04-22 | 2026-04-29 | plan | focus/position workplan | agent | archive-current | N | Multi-session workplan for implementing position preservation. "Session 5 complete." Feature implemented; canonical reference is `00-arch/02-focus-and-position-preservation.md`. |
| `kupua/exploration/docs/zz Archive/grid-view-plan.md` | `zz-archive` | grid | 437 | 2026-03-25 | 2026-04-17 | 2026-04-29 | plan | grid view | both | archive-current | N | Plan for grid (thumbnail) view. Marked "Implemented — ImageGrid.tsx is live." Archived but preserved as Kahuna analysis / design-decision reference. |
| `kupua/exploration/docs/zz Archive/home-logo-flash-handoff.md` | `zz-archive` | home | 215 | 2026-04-07 | 2026-04-07 | 2026-04-29 | handoff | logo flash bug | agent | done-handoff | N | Handoff for home-logo flash fix. Work executed. |
| `kupua/exploration/docs/zz Archive/kupua-audit-assessment.md` | `zz-archive` | kupua | 200 | 2026-03-23 | 2026-04-07 | 2026-04-29 | research-artefact | kupua assessment | both | archive-current | N | Early overall audit/assessment of kupua (March 2026). Predates most of the system's development. |
| `kupua/exploration/docs/zz Archive/metadata-display-plan.md` | `zz-archive` | metadata | 559 | 2026-03-27 | 2026-04-17 | 2026-04-29 | plan | metadata display | both | archive-current | N | Design plan for metadata panel. "Research complete — ready for discussion." Archived; Kahuna analysis section still has reference value. overlaps-with: `01-research/kahuna-image-detail-inventory.md`. |
| `kupua/exploration/docs/zz Archive/mobile-assessment.md` | `zz-archive` | mobile | 275 | 2026-04-09 | 2026-05-01 | 2026-04-29 | research-artefact | mobile issues | both | archive-current | Y — mobile issue inventory (`overscroll-behavior`, viewport, virtual keyboard) not captured in the active `root/touch-gestures-hardening-plan.md`, which scopes to gesture hook internals only. Consider lifting §1–§7 issue list there. | Broad mobile assessment. Last git-modified 2026-05-01 (3 weeks after creation), suggesting some items were addressed. |
| `kupua/exploration/docs/zz Archive/new-images-behaviour-comparison.md` | `zz-archive` | new | 138 | 2026-04-09 | 2026-04-26 | 2026-04-29 | research-artefact | new images behaviour | both | archive-current | N | Comparison of new-images notification behaviour. |
| `kupua/exploration/docs/zz Archive/panels-plan.md` | `zz-archive` | panels | 872 | 2026-03-26 | 2026-04-17 | 2026-04-29 | plan | panels system | both | archive-current | N | Plan for side-panel system. "Complete — all six implementation steps done." Archived; retained for scroll-anchor technique reference. |
| `kupua/exploration/docs/zz Archive/perceived-perf-audit.md` | `zz-archive` | perceived | 392 | 2026-04-24 | 2026-05-01 | 2026-04-29 | research-artefact | perceived perf | agent | archive-current | N | Phase 1 perceived-perf audit. Instrumentation built (`perceived-trace.ts`), test suite live. overlaps-with: `zz Archive/perf-measurement-report.md`. |
| `kupua/exploration/docs/zz Archive/perceived-perf-phase-2-handoff.md` | `zz-archive` | perceived | 595 | 2026-04-24 | 2026-05-01 | 2026-04-29 | handoff | perceived perf phase 2 | agent | done-handoff | N | Handoff for perceived-perf Phase 2. Work executed. |
| `kupua/exploration/docs/zz Archive/perf-measurement-report.md` | `zz-archive` | perf | 295 | 2026-03-31 | 2026-04-17 | 2026-04-29 | research-artefact | perf measurements | both | archive-current | N | Early perf measurement report (March 2026). overlaps-with: `zz Archive/performance-analysis.md` (later, more comprehensive). |
| `kupua/exploration/docs/zz Archive/perf-phase0-measurement-infra-plan.md` | `zz-archive` | perf | 392 | 2026-03-30 | 2026-04-17 | 2026-04-29 | plan | perf measurement infra | both | archive-current | N | Plan for perf measurement infrastructure. Implemented (harness shipped). Archived. |
| `kupua/exploration/docs/zz Archive/performance-analysis.md` | `zz-archive` | performance | 952 | 2026-03-24 | 2026-04-06 | 2026-04-29 | research-artefact | perf analysis | both | archive-current | N | Comprehensive March 2026 perf analysis. Many ✅ Fixed inline. Issues #3/#4/#5/#11/#13/#14 all resolved. overlaps-with: `perf-measurement-report.md` (smaller companion). |
| `kupua/exploration/docs/zz Archive/position-preservation-rearchitecture-handoff.md` | `zz-archive` | position | 407 | 2026-04-26 | 2026-04-27 | 2026-04-29 | handoff | position rearchitecture | agent | done-handoff | N | Handoff for rearchitecture evaluation; proposal was killed. Output summarised in `root/position-preservation-reference.md`. |
| `kupua/exploration/docs/zz Archive/prefetch-cadence-workplan.md` | `zz-archive` | prefetch | 694 | 2026-04-22 | 2026-04-22 | 2026-04-29 | plan | prefetch cadence | agent | archive-current | N | Multi-session workplan for prefetch cadence + carousel convergence. "Sessions 1–4 + 6 complete." Work done. |
| `kupua/exploration/docs/zz Archive/rendering-perf-plan.md` | `zz-archive` | rendering | 823 | 2026-03-29 | 2026-04-17 | 2026-04-29 | plan | render perf | both | archive-current | N | Rendering performance work plan. overlaps-with: `zz Archive/performance-analysis.md`. |
| `kupua/exploration/docs/zz Archive/scrubber-audit-report.md` | `zz-archive` | scrubber | 299 | 2026-03-28 | 2026-04-07 | 2026-04-29 | research-artefact | scrubber audit | both | archive-current | N | Audit of windowed scroll + scrubber work (5 unpushed commits at time of writing). Contains line-budget breakdown table. |
| `kupua/exploration/docs/zz Archive/selections-workplan.md` | `zz-archive` | selections | 625 | 2026-05-03 | 2026-05-03 | 2026-05-03 | plan | selections workplan | agent | archive-current | N | Selections feature workplan. Status: S0–S6 complete, S7 optional. Archived on completion. Companion: `00-arch/05-selections.md`. |
| `kupua/exploration/docs/zz Archive/structural-audit-assessment.md` | `zz-archive` | structural | 168 | 2026-04-03 | 2026-04-07 | 2026-04-29 | research-artefact | structural audit review | both | archive-current | N | Gap analysis of `03/kupua-02-structural-audit.md`. Found 9 gaps, 4 medium-severity. |
| `kupua/exploration/docs/zz Archive/swipe-carousel-review.md` | `zz-archive` | swipe | 711 | 2026-04-22 | 2026-04-22 | 2026-04-29 | research-artefact | swipe carousel review | agent | archive-current | N | Critical review of swipe carousel by fresh agent (post duplicate-image bug). Triggered `prefetch-cadence-workplan.md`. overlaps-with: `root/touch-gestures-hardening-plan.md`. |
| `kupua/exploration/docs/zz Archive/touch-gestures-handoff.md` | `zz-archive` | touch | 112 | 2026-04-21 | 2026-04-22 | 2026-04-29 | handoff | touch gestures | agent | done-handoff | N | Handoff for original swipe carousel work. Work executed. overlaps-with: `swipe-carousel-review.md`, `prefetch-cadence-workplan.md`. |
| `kupua/exploration/docs/zz Archive/traversal-perf-investigation.md` | `zz-archive` | traversal | 767 | 2026-04-01 | 2026-04-17 | 2026-04-29 | research-artefact | traversal perf | both | archive-current | N | Image traversal perf investigation. Contains "Three Eras of Prefetch Logic" table (Era 1/2/3 with exact commits). Historical context for current prefetch design. |
| `kupua/exploration/docs/zz Archive/Scrolling bonanza/Agent Nne chat.md` | `zz-archive-scroll` | Agent | 113 | 2026-04-05 | 2026-04-06 | 2026-04-29 | unclear | agent chat log | agent | archive-current | N | Raw agent chat transcript (Agent "Nne" = Swahili for 4). Informal; content likely captured in `scroll-worklog-agent10-final-fix.md`. |
| `kupua/exploration/docs/zz Archive/Scrolling bonanza/buffer-corruption-fix.md` | `zz-archive-scroll` | buffer | 387 | 2026-03-31 | 2026-04-06 | 2026-04-29 | research-artefact | buffer corruption | agent | archive-current | N | Root-cause analysis and fix for the buffer corruption bug (the scroll origin story). |
| `kupua/exploration/docs/zz Archive/Scrolling bonanza/fix-ui-coupling-plan.md` | `zz-archive-scroll` | fix | 751 | 2026-03-30 | 2026-04-07 | 2026-04-29 | plan | UI coupling fix plan | agent | archive-current | N | Detailed plan for UI coupling fix. Companion to `zz Archive/fix-ui-coupling-fix-handoff.md`. Work done. |
| `kupua/exploration/docs/zz Archive/Scrolling bonanza/focus-drift-and-scroll-handoff-v2.md` | `zz-archive-scroll` | focus | 436 | 2026-03-31 | 2026-04-07 | 2026-04-29 | handoff | focus drift + scroll | agent | done-handoff | N | v2 handoff for focus drift / scroll work. Supersedes `focus-drift-and-scroll-handoff.md`. Work executed. |
| `kupua/exploration/docs/zz Archive/Scrolling bonanza/focus-drift-and-scroll-handoff.md` | `zz-archive-scroll` | focus | 427 | 2026-03-31 | 2026-04-07 | 2026-04-29 | handoff | focus drift + scroll | agent | done-handoff | N | v1 handoff; superseded by `focus-drift-and-scroll-handoff-v2.md`. Both done. |
| `kupua/exploration/docs/zz Archive/Scrolling bonanza/home-logo-bug-research.md` | `zz-archive-scroll` | home | 87 | 2026-03-31 | 2026-04-07 | 2026-04-29 | research-artefact | home logo bug | agent | archive-current | N | Research into home-logo flash bug. overlaps-with: `zz Archive/home-logo-flash-handoff.md`. |
| `kupua/exploration/docs/zz Archive/Scrolling bonanza/scroll-02-tighten-swimming-tests-handoff.md` | `zz-archive-scroll` | scroll | 283 | 2026-04-06 | 2026-04-07 | 2026-04-29 | handoff | swimming test tighten | agent | done-handoff | N | Handoff for tightening swimming tests (round 2). Work executed. overlaps-with: `scroll-tighten-swimming-tests-handoff.md`. |
| `kupua/exploration/docs/zz Archive/Scrolling bonanza/scroll-bidirectional-seek-handoff.md` | `zz-archive-scroll` | scroll | 523 | 2026-04-06 | 2026-04-06 | 2026-04-29 | handoff | bidirectional seek | agent | done-handoff | N | Handoff for bidirectional seek implementation. Work executed (Agent 11–13). |
| `kupua/exploration/docs/zz Archive/Scrolling bonanza/scroll-post-perf-fixes-handoff.md` | `zz-archive-scroll` | scroll | 432 | 2026-03-31 | 2026-04-07 | 2026-04-29 | handoff | post-perf-fix scroll | agent | done-handoff | N | Handoff for scroll work after performance fixes. Work executed. |
| `kupua/exploration/docs/zz Archive/Scrolling bonanza/scroll-real-position-map-measurements.md` | `zz-archive-scroll` | scroll | 249 | 2026-04-14 | 2026-04-14 | 2026-04-29 | research-artefact | position map measurements | agent | archive-current | N | Real-cluster measurements of position-map fetch performance. |
| `kupua/exploration/docs/zz Archive/Scrolling bonanza/scroll-real-scrolling-profiling-handoff.md` | `zz-archive-scroll` | scroll | 65 | 2026-04-14 | 2026-04-14 | 2026-04-29 | handoff | scroll profiling | agent | done-handoff | N | Short handoff for real-cluster scrolling profiling session. Work executed. |
| `kupua/exploration/docs/zz Archive/Scrolling bonanza/scroll-real-scrolling-through-24-data-transfer-adr.md` | `zz-archive-scroll` | scroll | 123 | 2026-04-14 | 2026-04-14 | 2026-04-29 | research-artefact | data transfer ADR | agent | archive-current | N | ADR: decided against custom encoding / Zstandard / MessagePack. "No action needed." Specific decision not recorded elsewhere. |
| `kupua/exploration/docs/zz Archive/Scrolling bonanza/scroll-real-scrolling-through-24-workplan.md` | `zz-archive-scroll` | scroll | 743 | 2026-04-14 | 2026-04-14 | 2026-04-29 | plan | real-scrolling plan | agent | archive-current | N | Scroll-24 workplan for real-cluster scrolling investigation. Work executed. |
| `kupua/exploration/docs/zz Archive/Scrolling bonanza/scroll-real-scrolling-two-tier-audit-report.md` | `zz-archive-scroll` | scroll | 212 | 2026-04-14 | 2026-04-14 | 2026-04-29 | research-artefact | two-tier audit | agent | archive-current | N | Audit of two-tier virtualisation implementation. |
| `kupua/exploration/docs/zz Archive/Scrolling bonanza/scroll-real-scrolling-two-tier-virtualisation-workplan.md` | `zz-archive-scroll` | scroll | 438 | 2026-04-14 | 2026-04-14 | 2026-04-29 | plan | two-tier virtualisation | agent | archive-current | N | Workplan for two-tier virtualisation. Work executed; canonical reference is `00-arch/03-scroll-architecture.md`. |
| `kupua/exploration/docs/zz Archive/Scrolling bonanza/scroll-tighten-swimming-tests-handoff.md` | `zz-archive-scroll` | scroll | 447 | 2026-04-06 | 2026-04-07 | 2026-04-29 | handoff | swimming test tighten | agent | done-handoff | N | v1 swimming-test tighten handoff. overlaps-with: `scroll-02-tighten-swimming-tests-handoff.md`. |
| `kupua/exploration/docs/zz Archive/Scrolling bonanza/scroll-worklog-agent10-final-fix.md` | `zz-archive-scroll` | scroll | 566 | 2026-04-05 | 2026-04-06 | 2026-04-29 | worklog | scroll agent 10 | agent | archive-current | N | Historical worklog for Agent 10 (final swimming fix). |
| `kupua/exploration/docs/zz Archive/Scrolling bonanza/scroll-worklog-agent11-13-bidirectional-seek.md` | `zz-archive-scroll` | scroll | 586 | 2026-04-06 | 2026-04-06 | 2026-04-29 | worklog | scroll agents 11–13 | agent | archive-current | N | Historical worklog for Agents 11–13 (bidirectional seek). |
| `kupua/exploration/docs/zz Archive/Scrolling bonanza/scroll-worklog-agent9-seek-timing.md` | `zz-archive-scroll` | scroll | 193 | 2026-04-05 | 2026-04-06 | 2026-04-29 | worklog | scroll agent 9 | agent | archive-current | N | Historical worklog for Agent 9 (seek timing). |
| `kupua/exploration/docs/zz Archive/Scrolling bonanza/scrubber-dual-mode-ideation.md` | `zz-archive-scroll` | scrubber | 946 | 2026-03-29 | 2026-04-17 | 2026-04-29 | research-artefact | scrubber dual-mode | both | archive-current | N | Ideation for dual-mode scrubber (linear vs non-linear). overlaps-with: `01-research/scrubber-nonlinear-research.md` (same topic, different angle). |
| `kupua/exploration/docs/zz Archive/Scrolling bonanza/testing-regime-and-tuning-plan-handoff.md` | `zz-archive-scroll` | testing | 737 | 2026-04-07 | 2026-04-07 | 2026-04-29 | handoff | testing + tuning | agent | done-handoff | N | Handoff for testing regime and tuning plan. Work executed (phases 1–6). |
| `kupua/exploration/docs/zz Archive/Scrolling bonanza/testing-regime-and-tuning-worklog.md` | `zz-archive-scroll` | testing | 1282 | 2026-04-07 | 2026-04-07 | 2026-04-29 | worklog | testing + tuning | agent | archive-current | N | Multi-session worklog for testing regime and tuning (1282 lines). |

---

## Summary

### 1. Counts

**Total files: 114**

| Folder | Count |
|---|---|
| `00-arch` | 13 |
| `01-research` | 14 |
| `03-future` | 11 |
| `root` | 13 |
| `zz-archive` | 44 |
| `zz-archive-scroll` | 19 |
| **Total** | **114** |

| Doc type | Count |
|---|---|
| `living-reference` | 16 |
| `research-artefact` | 37 |
| `plan` | 27 |
| `handoff` | 24 |
| `worklog` | 5 |
| `changelog` | 1 |
| `unclear` | 1 (`Agent Nne chat.md`) |

| Apparent status | Count |
|---|---|
| `canonical` | 40 |
| `superseded` | 7 |
| `done-handoff` | 22 |
| `stale-suspected` | 6 |
| `archive-current` | 37 |
| `unclear` | 0 (none unresolved) |

**Lift candidates in zz-archive/zz-archive-scroll:** 1 of 63 (1.6%)

---

### 2. Newest-in-topic per folder (`03 Ce n'est pas une pipe dream/`)

| Topic group | Canonical (newest) | Superseded |
|---|---|---|
| Integration plan | `integration-workplan-bread-and-butter.md` (2026-04-28) | `integration-plan.md` (2026-04-17) |
| Integration architecture | `integration-plan-api-first.md` (2026-04-17) | — (companion, not superseded) |
| Kupua structural series | `kupua-02-structural-audit.md` (research, kept) | `kupua-01` (superseded), `kupua-03`, `kupua-04` (superseded) |
| Kupua realistic plan | `kupua-05-realistic-work-plan.md` (stale-suspected; executed) | — |
| Scroll stability | `scroll-01-stability-audit-realistic.md` (2026-04-06) | `scroll-00-stability-audit.md` |
| Overall migration | `integration-workplan-bread-and-butter.md` | `root/migration-plan.md` (superseded) |

---

### 3. Obvious overlap clusters

1. **Scroll architecture / audit:** `00-arch/03-scroll-architecture.md` + `root/scroll-audit.md` + `03/scroll-00` + `03/scroll-01`. All describe the same scroll system; architecture is canonical, audit is read-only companion, `scroll-00`/`scroll-01` are superseded/superseder pair.

2. **Integration planning triple:** `03/integration-plan.md` (superseded) + `03/integration-plan-api-first.md` (canonical reference) + `03/integration-workplan-bread-and-butter.md` (canonical workplan). Three docs on the same topic; could be confusing.

3. **Selections arc:** `00-arch/05-selections.md` + `01-research/selections-kahuna-findings.md` + `01-research/selections-kahuna-pills-location-leases-findings.md` + `zz/selections-workplan.md`. All four live; no reduction needed but they form a tight cluster.

4. **Scrubber knowledge:** `00-arch/scrubber-ticks-and-labels.md` + `01-research/scrubber-nonlinear-research.md` + `zz-archive-scroll/scrubber-dual-mode-ideation.md`. Three scrubber docs; arch doc is canonical, others are research/ideation.

5. **Performance layers:** `zz/performance-analysis.md` + `zz/rendering-perf-plan.md` + `zz/perf-measurement-report.md` + `zz/perf-phase0-measurement-infra-plan.md` + `zz/perceived-perf-audit.md`. Five perf docs all archived; no canonical perf reference in live docs.

6. **UI coupling arc:** `zz/fix-ui-coupling.md` + `zz/fix-ui-docs-eval.md` + `zz/fix-ui-coupling-fix-handoff.md` + `zz-archive-scroll/fix-ui-coupling-plan.md`. Four docs on the same now-resolved issue.

7. **Browser history arc:** `zz/browser-history-audit-handoff.md` + `zz/browser-history-audit-output.md` + `zz/browser-history-baseline-tightening-handoff.md` + `zz/browser-history-code-review.md` + `zz/browser-history-future-polish-handoff.md` + `zz/browser-history-workplan.md`. Six docs; all archived, canonical reference is `00-arch/04-browser-history-architecture.md`.

---

### 4. Handoffs ready to delete

All of the following are `done-handoff` — work executed, canonical output exists elsewhere. Listed for mk's review:

**`root/`**
- `bulk-fetch-feasibility-handoff.md` (output: `01-research/media-api-enrichment-strategy-findings.md`)
- `docs-inventory-handoff.md` (output: this file)

**`zz Archive/`**
- `browser-history-audit-handoff.md`
- `browser-history-baseline-tightening-handoff.md`
- `browser-history-future-polish-handoff.md`
- `bug-hunt-audit-handoff.md`
- `density-focus-drift-handover.md`
- `fix-ui-coupling-fix-handoff.md`
- `home-logo-flash-handoff.md`
- `perceived-perf-phase-2-handoff.md`
- `position-preservation-rearchitecture-handoff.md`
- `touch-gestures-handoff.md`

**`zz Archive/Scrolling bonanza/`**
- `focus-drift-and-scroll-handoff.md` (v1; also `focus-drift-and-scroll-handoff-v2.md`)
- `focus-drift-and-scroll-handoff-v2.md`
- `scroll-02-tighten-swimming-tests-handoff.md`
- `scroll-bidirectional-seek-handoff.md`
- `scroll-post-perf-fixes-handoff.md`
- `scroll-real-scrolling-profiling-handoff.md`
- `scroll-tighten-swimming-tests-handoff.md`
- `testing-regime-and-tuning-plan-handoff.md`

(22 done-handoffs total)

---

### 5. Anything weird

1. **`01-research/scroll-consolidation-and-signals-plan.md`** — content is a *plan* (not a research artefact), wrong folder. Part B (Signals spike) was "next" in April 2026 and appears never to have been executed.

2. **`03/integration-workplan-bread-and-butter.md`** — mtime is 2026-05-07 (today), gitmod is 2026-05-04. Three-day gap suggests uncommitted edits exist.

3. **Three untracked files** — `bulk-fetch-feasibility-handoff.md`, `media-api-enrichment-strategy-findings.md`, and `docs-inventory-handoff.md` all have no git history. Created today (2026-05-07).

4. **`zz Archive/Scrolling bonanza/Agent Nne chat.md`** — an agent chat transcript (113 lines), categorised `unclear`. Likely redundant with `scroll-worklog-agent10-final-fix.md` but not confirmed.

5. **`00-arch/s3-proxy.md`** is marked "Temporary Phase 1–2" and codebase has since moved beyond Phase 2. May be stale or require an update.

6. **`root/search-after-plan.md`** (2191 lines) was never archived despite implementation being complete. It's the largest root doc and the only major plan at root that predates archiving practices. Candidate for archiving or deletion.

7. **No canonical perf reference exists in live docs.** Five perf docs are all archived (`zz Archive/`). If perf work resumes, there's nothing to update — a new doc would need to be created rather than updating an existing one.

8. **`03/kupua-00-05` series** — five sequential docs at different planning stages, 4,939 combined lines. Three are superseded. The structural audit (`kupua-02`) is the only one that clearly earns its keep as a canonical reference.
