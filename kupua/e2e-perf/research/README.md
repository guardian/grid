# Performance Research Laboratory

Use bounded exploration and controlled experiments to find worthwhile performance
improvements. The first target is sustained scrolling in Grid, Justified and Table:
stable pictures and position, useful progress, ready images and consistent frames.
This is a working procedure, not an autonomous optimisation service or a new harness.

## Start Here

1. Follow [project orientation](../../AGENTS.md) and read the
	[session worklog](../../exploration/docs/worklog-current.md). Confirm the operator's
	task and permissions; a previous experiment does not authorise another live run.
2. Read [Experiments and Follow-Up](experiments.md). It records current leads,
	rejected approaches, evidence locations and the next unanswered questions.
	Recheck the relevant implementation and build before treating an old finding as current.
3. Choose one question, then find the nearest recipe in [controls](controls.md).
	Inspect existing evidence before proposing a new measurement. Do not rerun the
	historical matrix merely to get oriented.

| Location | Owns |
| --- | --- |
| This README | General procedure, execution boundaries and where to put work |
| [Experiments and Follow-Up](experiments.md) | Experiment questions, findings, disposition and resumption pointers |
| [Control reference](controls.md) | Named executable recipes, fixture mechanics and method-specific limits |
| [Existing scrolling evidence](../../exploration/docs/scroll-horizons-thumb-lookahead-results.json) | Detailed scrolling observations, comparison rows and exclusions; extend the relevant record rather than copying it |
| [Scroll continuity guide](../../exploration/docs/scroll-horizons-thumbs-and-blocking.md) | Selected product policies and accepted trade-offs, not session progress |
| [Campaign guide](../README.md) and [measurement contracts](../measurement-reference.md) | Operator-run checkpoints, canonical histories and metric definitions |
| [Measurement validation](../validation/README.md) | Maintained detector checks, separate from research and product E2E |

## Working Procedure

**Explore, experiment, challenge.** These are responsibilities, not a requirement
to spawn three agents. One agent can perform separate passes; delegation requires
explicit authority. A challenger should test the conclusion independently, not
assume that a passing experiment or its author's interpretation proves a benefit.
One coordinator owns the experiment record and any shared browser.

1. **Explore with a budget.** Agree a time/request budget and use the app: gentle
	and fast browsing, forward/backward travel, reversal, stopping, fresh entry after
	a seek, and buffer publication/eviction. Layout switching is setup or a guardrail,
	not the main scrolling workload. Leave room for unexpected symptoms instead of
	assigning every component an optimisation quota.
2. **Choose a falsifiable question.** Record what the user does and sees, the
	suspected cause, what would refute it and why existing evidence cannot answer it.
	Keep at most three actionable leads in a pilot and investigate one at a time.
	A measured residual cost is a lead, not automatically a worthwhile defect.
3. **Reproduce and attribute.** Reuse existing drivers and observers. Start with
	minimal observation, then capture the troublesome motion or publication interval.
	Check both triggering reads and preceding invalidating writes. Bound action time
	inside the browser; controller round trips and setup are not user latency.
4. **Compare narrowly.** Establish baseline repeatability before testing one or
	two small candidates. Match starting data, available records, placement, geometry,
	media and achieved work where possible; disclose mismatches and setup costs.
	Counterbalance order, for example A/B/B/A. Verify that the treatment actually
	ran. A few repetitions are screening evidence, not population-tail estimates.
5. **Challenge the result.** Check useful outcomes and costs together. Repeat a
	promising result with heavy probes removed and on the relevant production build;
	local DEV mechanisms alone do not establish hosted benefit. Where input or
	presentation matters, use appropriate native-input/presentation evidence, including
	an operator trackpad check when needed. Scripted scrolling and injected wheel input
	do not certify physical trackpad behaviour.
6. **Decide and close.** Record promising, rejected, inconclusive or invalid capture
	explicitly. A valid negative result can finish the investigation. Stop a rejected
	recipe unless new evidence changes its premise; do not turn it into a framework
	or keep tuning until a favourable number appears. If measurement repair becomes
	the main task, stop and agree the scope rather than silently expanding it.

The [Scrubber case study](mobile-perf-measurement/case-study.md) illustrates this
loop, including an ineffective change rejected after behaviour tests passed.

## What Counts as Improvement

| Outcome | Check independently |
| --- | --- |
| Stability | Intended image identities, position and truthful aspect ratios; distinguish arrival animation and applied input from unsolicited movement |
| Progress | Achieved travel and data supply, temporary blocking and missing-data exposure; not commanded pixels alone |
| Image readiness | Current-image exposure during motion and after stopping, including late publications; retain censored or changed-cohort outcomes |
| Smoothness | Frame intervals, hitches and event-local work; whole-journey percentiles can hide rare publication stalls |

Record CPU, memory, metadata reads, image demand and reversal/revisit costs alongside
these outcomes. No combined score, lower render count or smaller backlog can trade
away a required browsing behaviour. Preserve the existing placement owner, focus,
selection, navigation, correct image presentation and bounded resources.

Keep loaded, decoded and painted distinct. Animation-frame samples are not physical
display frames; DOM replacement is not proof of blank paint. Verify observer
sensitivity and overhead when they matter. Record source/build identity, data mode,
API topology, media delivery, browser, viewport/DPR, result regime, input method and
cache conditions. HTTP-cache bypass does not clear decoded or upstream caches.

## Record and Resume

Use the short [experiment record format](experiments.md#record-format). Keep one
entry per question, with dated findings and an explicit next discriminator or closure.
Update its status rather than adding a new handoff document after each session.
Detailed numbers remain in their existing evidence file; link its exact record key.
For a new subject with no suitable evidence home, add one only when actual output
needs it, not an empty directory or per-run scaffold.

The worklog holds temporary progress and active ownership. Before resetting it,
retain useful findings, invalid/excluded evidence and resumption instructions in
the owning experiment record. Do not transfer terminal transcripts, browser IDs,
temporary permission grants or the entire session log. Planning and documentation
organisation do not belong in the product changelog.

## Run Locally

Research uses [the existing spec](density-app-research.spec.ts), mock metadata and
synthetic/local media. It owns port 3041, starts an isolated frontend, blocks services
and writes no canonical campaign history. Select a named control from
[controls](controls.md); do not use the placeholder below literally:

```sh
set -o pipefail
npm --prefix kupua run test:perf-research -- --grep '<named control>' 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
```

Run from the repository root. The separate `typecheck:perf`, `test:perf-harness`,
`test:perf-fixtures` and `test:perf-app` scripts validate the measurement machinery;
use the same foreground pipefail/tee wrapper and the
[validation guide](../validation/README.md) to select the relevant surface.
An unfiltered research run includes historical comparisons and is not a routine gate.

Research is **not executed** by `test:perf`, `--full`, `test:perf-app` or ordinary
E2E. It **is compiled** by `typecheck:perf`, including campaign compiler preflight.
Changing a shared research helper requires checking its affected existing controls.

## Safety and Graduation

- Serialise measured browser workloads on a machine. Do not drive the app, edit
  its source or run competing work during an operator campaign. Parallel reasoning
  does not require parallel measurement.
- Live TEST/CODE/PROD access needs fresh session-specific authority and explicit
  bounds. Preserve read-only safeguards. No live mutation, server restart, deployment,
  dependency change or product implementation follows from an experiment record.
  Campaigns and dry runs remain operator-run under the standing project rules.
- Read the [browser playbook](../../exploration/docs/embedded-browser-playbook.md)
  before browser work. Raw captures can contain screenshots, identities, signed URLs
  and credentials. Keep authorised raw captures private outside the checkout, retain
  only allowlisted/redacted findings and delete captures after analysis.
- Release held input and requests, detach collectors, remove timers/routes/wrappers
  and verify cleanup. Preserve original property descriptors before wrapping; failed
  restoration invalidates that baseline and requires a clean reload before proceeding.
- Product selection requires a worthwhile measured benefit, explicit trade-offs,
  regression coverage and the full applicable project gates. Agents suggest the
  relevant operator campaign; a research pass is not performance acceptance.
- Graduate a useful result to a maintained campaign signal, a detector in validation,
  a product regression, or a documented one-off. Dormant controls can remain in
  research without becoming habitual workloads. Campaigns must never import research;
  preserve historical evidence and distinguish measurement revisions.