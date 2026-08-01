# The Wandering Cookbook — Agent-Driven Exploratory Bug Hunting

> **Created:** 2026-07-30
> **Status:** Experimental. First run pending.
> **Instrument:** The **embedded VS Code browser** (`open_browser_page`, `read_page`,
> `click_element`, `type_in_page`, `run_playwright_code`, `screenshot_page`).
> This is *not* about the headless Playwright suites in `e2e/` — those are the
> existing, deterministic tests. This is a human-like agent poking a live app.
> **Companion:** `embedded-browser-playbook.md` — accumulated technique notes.
> **Read before wandering:** that playbook, then this file, then the mission you picked.

---

## 1. Prime Directive: You Are Not the Judge

You do not know what this app is supposed to look like. Nobody has written down
"correct" and nobody is going to.

Therefore: **you report observations tied to an oracle, not verdicts.** An oracle
is an external source of truth that does not depend on your taste. There are four
(§7), and every finding must name the one it rests on.

If you find yourself writing "this should probably…" or "it would be better if…",
delete it. That is a design opinion, and design opinions from an agent that has
seen the app for twenty minutes are noise. The user has to triage everything you
produce; a false positive costs them more than a false negative costs you.

**Hard rule:** a finding with no oracle is not a finding. Drop it.

---

## 2. Scope

**In scope:** scroll behaviour and position preservation. That is: the scrubber,
the three scroll tiers, the windowed buffer, focus (explicit and phantom), the
viewport anchor, browser history restore, and everything in the guarantee table
of `00 Architecture and philosophy/02-focus-and-position-preservation.md` §2.2.

This is the only area of kupua with a **written invariant table**, which is what
makes exploratory hunting viable here and nowhere else.

**Anti-goals — do not spend turns on:**

- Visual design, spacing, colour, copy, iconography
- Refactor proposals, code-quality opinions, architecture suggestions
- Metadata panel content correctness, field formatting, CQL semantics
- AI search, collections, syndication, leases, cost
- Anything you cannot tie to §7

Off-scope things you happen to notice go in a capped appendix at the end of the
findings doc: **max 10 items, one line each, no elaboration.**

---

## 3. Safety

**The repo is public.** Anything written to disk under `kupua/` may be committed
and become permanent public history.

- **Never write screenshots of TEST data to disk.** Screenshots may be taken (they
  return into the conversation) but must not be saved into the repo. Describe what
  you saw in prose instead.
- **Redact in findings docs:** uploader email addresses, `Authorization` headers,
  signed S3/CloudFront URLs (`AWSAccessKeyId`, `Signature`, `x-amz-security-token`),
  internal hostnames, AWS keys or session tokens. If unsure, redact.
- Image IDs and result counts are fine.

**TEST is a real cluster serving real editorial staff.**

- Read-only. Never issue a write. The app enforces this and AWS credentials
  enforce it too, but do not go looking for the edge of that fence.
- Do not weaken safeguards in `es-config.ts` or `load-sample-data.sh`.

**Ports.** You may start and stop dev servers. But `npm run test:e2e` needs :3000
free and the tier matrix needs :3010/:3020/:3030. Before starting a server, check
what is already listening and tell the user what you are about to occupy. Never
kill a process you did not start.

---

## 4. Setup

### 4.1 Choose a bed

| Bed | Command | Docs | Tiers reachable |
|---|---|---|---|
| **TEST** (preferred) | `./kupua/scripts/start.sh --use-TEST` | ~1.3m | All three, naturally |
| **Local** | `./kupua/scripts/start.sh` | ~10k | Buffer + two-tier; seek only by forcing |

TEST is the better bed: real data volume, real latency, real result-set shapes.
Requires Janus credentials and an SSH tunnel — if the tunnel is not up, ask the
user rather than fighting it.

### 4.2 Pin the corpus — this is not optional

TEST is a live index. New images arrive continuously. **A self-consistency oracle
(§7.2) will produce false positives if the result set changes underneath you.**

Always include an `until` bound. Use the pinned corpora from `AGENTS.md`:

| Tier | Total | Search params |
|---|---|---|
| Scroll (≤1k) | 958 | `nonFree=true&query=keyword:"mid length half celebration"&until=2026-03-04T00:00:00Z` |
| Two-tier (1k–65k) | 14,399 | `nonFree=true&until=2026-03-04T00:00:00Z&query=city:Dublin` |
| Seek (>65k) | 1,304,298 | `nonFree=true&until=2026-03-04T00:00:00Z` |

If you invent your own query, it **must** carry `until=2026-03-04T00:00:00Z`.
Record the exact URL in the findings doc — without it the finding is unreproducible.

### 4.3 Forcing a tier on local

Tier is normally derived from result count. Locally you can override the
thresholds so the 10k sample corpus exercises any tier
(see `playwright.tiers.config.ts`):

```bash
VITE_SCROLL_MODE_THRESHOLD=15000 npm --prefix kupua run dev -- --port 3010  # buffer tier
npm --prefix kupua run dev -- --port 3020                                    # two-tier
VITE_POSITION_MAP_THRESHOLD=0 npm --prefix kupua run dev -- --port 3030      # seek tier
```

Useful when a TEST finding needs isolating, or when the tunnel is unavailable.

---

## 5. Instruments and Token Discipline

Cost per call varies by more than an order of magnitude. Default to the cheapest
tool that answers the question.

| Tool | Cost | Use for |
|---|---|---|
| `run_playwright_code` | **Low** | Reading exact state, scrolling, seeking, arming traps. **Your primary instrument.** |
| `click_element` / `type_in_page` | Low | Interactions. Returns an inline diff — usually no follow-up read needed. |
| `read_page` | Medium | Getting element refs, confirming structural change. Not for reading state you could `evaluate`. |
| `screenshot_page` | **High** (vision) | Only when the question is genuinely visual: is something torn, blank, overlapping, mid-flicker. |

**The single biggest token saver:** this app exposes its own state. Do not read a
page snapshot to work out where you are — ask the store.

```js
// via run_playwright_code
return page.evaluate(() => ({
  anchor: window.__kupua_getViewportAnchorId__?.(),
  visible: window.__kupua_getVisibleImageIds__?.(),
  key: window.__kupua_getKupuaKey__?.(),
}));
```

Available hooks (dev builds only):

| Hook | Gives you |
|---|---|
| `__kupua_store__` | Search store. `.getState()` → buffer, total, focus, positions |
| `__kupua_selection_store__` | Selection store |
| `__kupua_getViewportAnchorId__()` | Current phantom anchor image ID |
| `__kupua_getVisibleImageIds__()` | Image IDs currently in viewport |
| `__kupua_getKupuaKey__()` | Current history-entry identity |
| `__kupua_inspectSnapshot__(key)` | Saved scroll/focus snapshot for a history key |
| `__kupua_router__` | TanStack Router instance |
| `__perceivedTrace__` | Perceived-perf entries (needs enabling, §7.1) |

**Mission 0, always:** probe the store shape before relying on field names.

```js
return page.evaluate(() => Object.keys(window.__kupua_store__.getState()));
```

Do not assume field names from this document. Verify, then use.

---

## 6. Arm the Traps Before You Wander

The embedded browser gives you no automatic error reporting. Install an in-page
collector so hard signals (§7.1) accumulate while you interact.

```js
return page.evaluate(() => {
  if (window.__wander__) return "already armed";
  const w = { errors: [], warns: [], rejections: [], failedRequests: [] };
  window.__wander__ = w;
  const origErr = console.error, origWarn = console.warn;
  console.error = (...a) => { w.errors.push(a.map(String).join(" ")); origErr(...a); };
  console.warn  = (...a) => { w.warns.push(a.map(String).join(" ")); origWarn(...a); };
  window.addEventListener("error", (e) => w.errors.push("onerror: " + e.message));
  window.addEventListener("unhandledrejection", (e) => w.rejections.push(String(e.reason)));
  return "armed";
});
```

**Critical:** this is wiped by any full page navigation or reload. Re-arm after
every `goto`, every reload, and every browser back/forward. Losing the collector
mid-mission and not noticing is the classic way to produce a clean-looking session
that actually tested nothing.

Drain it at checkpoints:

```js
return page.evaluate(() => {
  const w = window.__wander__;
  const out = JSON.parse(JSON.stringify(w));
  w.errors = []; w.warns = []; w.rejections = []; w.failedRequests = [];
  return out;
});
```

**Also critical — reset state between missions.** The embedded browser is a
persistent user session. `localStorage` (panel state, focus mode, column widths)
and `sessionStorage` (selection, history snapshots, image offset cache) survive
navigation. State bleeding from a previous mission is a false-positive factory.

```js
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
// then navigate fresh and re-arm
```

Exception: missions that deliberately test reload/back-forward restore must *not*
clear storage mid-mission — that is the thing under test. Clear before, not during.

---

## 7. The Four Oracles

Every finding names one of these.

### 7.1 Hard signals — free, no knowledge required

A console error, an unhandled rejection, a React warning, a failed or duplicated
network request, an error boundary rendering. The app is accusing itself.

Note: `console.warn` is used deliberately on some error paths (e.g. ES PIT
expiry-and-retry in `es-adapter.ts`). A warn alone is weak evidence. An *error* or
a *rejection* is strong.

For perf, enable perceived tracing before the mission and read it after — but
**do not report timing numbers as findings.** Agent-driven interaction has huge
latency variance; you would be timing yourself. Report only *shape*: "this
scenario fires N requests where the equivalent fires 1", "this state produced a
visible blank/skeleton region that persisted across many frames". Hand the
scenario to `npm --prefix kupua run test:perf`; never assert a millisecond figure.

### 7.2 Self-consistency — the workhorse

You need no knowledge of correctness, only that the app must agree with itself.

- Do X, undo X → back to the starting state
- Do X twice → same result both times
- Reach the same state by two different routes → identical state
- Reload → same place
- Back → where you were

This is where the real bugs in a scroll/position engine live.

### 7.3 Metamorphic relations

Relations that must hold regardless of what the data is:

- `aria-valuenow` on the scrubber is within `[0, total-1]`, always
- Narrowing a filter → new total ≤ old total
- Visible image IDs contain no duplicates
- Buffer size never exceeds 1000
- Scrolling down monotonically → anchor position never decreases

### 7.4 Documented invariants

The guarantee table in `02-focus-and-position-preservation.md` §2.2. Read it
before the mission. Summary of what must survive:

| Event | Guarantee |
|---|---|
| Density change (grid ↔ table) | Anchor at same viewport-relative position |
| Panel open/close | Anchor stays in view |
| Window resize | Anchor stays in view |
| Sort change, **explicit** focus | Focused image found and scrolled to |
| Seek, **explicit** focus | Focus persists as durable state; seeking back restores it |
| Search context change | Focused image survives if present; else nearest surviving neighbour; else top |
| Buffer eviction | Explicit focus persists as an ID even when out of buffer |

Violating one of these is a real finding. **But read §8 first.**

---

## 8. Intentional Behaviours — DO NOT REPORT

These look like bugs and are not. They are documented relaxations
(`02-focus-and-position-preservation.md` §4). Reporting them wastes the user's
triage time and damages the credibility of everything else in your report.

| Behaviour | Why it is intentional |
|---|---|
| **Phantom focus + sort change → resets to top** | Deliberate relaxation. User changing sort without a specific image in mind wants "what's first in the new order" |
| **Phantom focus + seek → no memory of previous position** | Phantom tracks "where you are"; a seek means "take me elsewhere" |
| **Completely disjoint search → reset to top** | Adjacency is meaningless when the result sets don't overlap |
| **Explicit focus ring not rendered after a distant seek** | Focus is still set; the image is simply off-screen |
| **Arrow keys scroll rows (not move focus) in phantom mode** | Phantom mode has no focus affordance, by design. Not a missing feature |
| **Single-click focuses instead of opening detail (explicit mode)** | Explicit mode: single = focus, double = detail. Differs from kahuna on purpose |
| **`Enter` and `f` do nothing in phantom mode** | No focused image to act on |
| **Skeleton/placeholder cells outside the buffer in two-tier** | Core to the two-tier design |
| **Grid API data missing (leases, usage, cost)** | Graceful absence is the rule. Absent data is never an error |

**Behaviour differs by focus mode.** Before reporting anything focus-related,
check which mode you are in and confirm the behaviour is wrong *for that mode*:

```js
return page.evaluate(() => localStorage.getItem("ui-prefs"));
```

Confirm the current mode set in `src/stores/ui-prefs-store.ts` rather than
assuming — this document may lag the code.

**Already covered by e2e — do not re-derive.** Scrubber drag/seek across tiers,
arrow/Page/Home/End navigation, focus survival across query and sort change,
neighbour fallback, back/forward restore, density toggle, logo reset, buffer
corruption after deep seek. Read `e2e/local/` before wandering. Your value is in
the *combinations and orderings nobody wrote a test for*, not in the happy paths.

---

## 9. Missions

**Run ONE mission per session.** Then report and stop. A session is roughly
20–30 interactions. Do not chain missions — context bloat degrades your judgement
and the summarisation will eat your early observations.

Every mission: clear storage → navigate to a pinned corpus URL → arm the traps →
record the starting anchor → act → compare → drain traps.

### M1 — Density round-trip ✅ RUN (all 3 tiers; 31 July 2026)
Grid → table → grid. Anchor before vs after. *Oracle: 7.2, 7.4.*
See `wandering-findings/W-2026-07-31-m1-m2-m6-m8-tier-rerun.md` — clean in
two-tier (1-item drift, within tolerance) and seek tier (exact match, no
drift). Also clean in scroll tier from the 2026-07-30 scroll-batch session.

### M2 — Panel thrash ✅ RUN (all 3 tiers; 31 July 2026)
Toggle left panel, right panel, both, in several orders, at different scroll
depths. *Oracle: 7.4.* The orderings are what e2e doesn't cover.
See `wandering-findings/W-2026-07-31-m1-m2-m6-m8-tier-rerun.md` — clean in
two-tier and seek tier (anchor tracks viewport-width changes as expected, no
drift accumulation, no errors). Also clean in scroll tier from the
2026-07-30 scroll-batch session.

### M3 — Resize under load ✅ RUN (seek, buffer, two-tier; 31 July 2026) — OPEN BUG FOUND
Resize the viewport while a fetch is in flight (resize immediately after a seek).
*Oracle: 7.4, 7.1.* Race conditions between resize-driven relayout and buffer
replacement are plausible and untested.
See `wandering-findings/W-2026-07-31-m3-m4-m5-coverage.md` — clean in all three
tiers for the live-browser scenarios exercised. The one sub-scenario that
couldn't be forced live (resize landing exactly during an in-flight
`extendBackward` fetch) was followed up with a deterministic Vitest test —
see `wandering-findings/W-2026-07-31-m3-extendbackward-resize-bug.md`: **a
real, reproducible bug, not a race at all** — `extendBackward`'s column-trim
doesn't reconcile a pre-existing `bufferOffset` against a new column count,
so any resize while scrolled to a non-edge position followed by any later
backward scroll can leave `bufferOffset` misaligned. Documented via two
`it.fails` regression tests in `search-store-extended.test.ts`, not yet
fixed — needs a scoped decision, not more investigation.

### M4 — Detail round-trip depth ✅ RUN (seek, buffer, two-tier; 31 July 2026)
Open detail, arrow through 20+ images, return. Repeat from different scroll
depths and different tiers. *Oracle: 7.2.* Note: "where should you land after a
long detail session" is an **open question** in §4 of the arch doc — if the
behaviour seems odd, report it as a *question*, not a bug.
See `wandering-findings/W-2026-07-31-m3-m4-m5-coverage.md` — clean in all
three tiers. Answers the open question: lands on the last-viewed image, not
the entry image, consistently across tiers.

### M5 — History stress ✅ RUN (all 3 tiers; 31 July 2026)
Interleave: search change, scroll, density toggle, detail open, back, back,
forward, back. Check `__kupua_getKupuaKey__()` and `__kupua_inspectSnapshot__()`
at each step. *Oracle: 7.2.* Deep interleavings are where snapshot identity is
most likely to break.
See `wandering-findings/W-2026-07-31-m3-m4-m5-coverage.md` — clean in all three
tiers (explicit focus always exact), including a deeper interleave
(sort→scroll→panel→back→forward) than the base recipe, and a bonus
seek→buffer tier crossing mid-mission. One low-severity, non-filed
observation, confirmed in both buffer and seek tiers: the phantom/unfocused
anchor takes 2-3 leave-and-return cycles to stabilize on a fixed
image/position rather than restoring identically every time (as it did in
two-tier) — bounded, not compounding, doesn't affect explicit focus.

### M6 — Reload at awkward moments ✅ RUN (all 3 tiers; 31 July 2026)
Reload mid-seek, mid-fetch, immediately after a sort change, while detail is open.
*Oracle: 7.2, 7.1.*
See `wandering-findings/W-2026-07-31-m1-m2-m6-m8-tier-rerun.md` — clean in
two-tier and seek tier (reload-after-scroll, reload-after-sort with sort
surviving correctly, reload-while-detail-open with focus/URL preserved; seek
tier also tested reload-immediately-after-a-real-`seek()` call, cleanly
abandoned with no corruption). Also clean in scroll tier from the
2026-07-30 scroll-batch session.

### M7 — Seek idempotence ✅ RUN (all 3 tiers; 30–31 July 2026)
Seek to the same scrubber position twice via different routes (drag from left vs
drag from right vs keyboard). Compare resulting anchor and buffer offset.
*Oracle: 7.2, 7.3.* Strong candidate — bidirectional seek has asymmetric code paths.
See `wandering-findings/W-2026-07-30-seek-idempotence.md` (seek tier —
medium-confidence F2: click/drag-from-above/drag-from-below land on
measurably different positions) and
`wandering-findings/W-2026-07-31-m7-m9-final-coverage.md` (buffer and
two-tier — clean, bit-for-bit identical across all 3 routes in both tiers,
confirming F2's route-bias mechanism is seek-tier-specific).

### M8 — Monotonic scroll ✅ RUN (all 3 tiers; 31 July 2026)
Scroll down steadily through several buffer extends. Assert anchor position never
decreases and visible IDs never duplicate. *Oracle: 7.3.* Swimming/drift is the
historically fragile area.
See `wandering-findings/W-2026-07-31-m1-m2-m6-m8-tier-rerun.md` — clean in
two-tier (anchor position strictly increased across 8 steps) and seek tier
(`resultsLen` grew correctly via `extendForward`, 0 duplicates throughout).
Also clean in scroll tier from the 2026-07-30 scroll-batch session.

### M9 — Focus as bookmark across tiers ✅ RUN (all 3 tiers; 31 July 2026)
Set explicit focus, seek far away, seek back. Then repeat having crossed a tier
boundary by changing the query. *Oracle: 7.4.*
See `wandering-findings/W-2026-07-31-focus-bookmark-across-tiers.md` (original
F3/F4 discovery — now fixed, commits `34c168e41`/`dbb332f5f`) and
`wandering-findings/W-2026-07-31-m7-m9-final-coverage.md` (post-fix
re-verification of the exact explicit-focus+sort-toggle mechanism, live TEST,
all 3 tiers — clean, including catching buffer tier's async settle process
mid-flight with focus correctly present throughout). Also documents a
tier-crossing density observation (sparse-tag narrowing correctly triggers
the documented "no neighbours survive → top" fallback, not a bug).

### M10 — Tier boundary agreement ✅ DONE (all 3 tiers, 30 July 2026)
Same local corpus, three servers (§4.3), same query and scroll target. Compare
resulting anchor/position across tiers. *Oracle: 7.2.* Tiers should agree about
where position N is. Requires local mode.
See `wandering-findings/W-2026-07-30-tier-boundary-agreement.md` — buffer,
two-tier, and seek all agreed at the position-0 baseline.

### M11 — Interrupt everything ✅ RUN (all 3 tiers; 31 July 2026)
Start an action, interrupt it with another before it settles: seek then
immediately sort; sort then immediately change query; scroll then immediately
toggle density. *Oracle: 7.1, 7.3.* This is the highest-yield mission and the
least covered by tests.
See `wandering-findings/W-2026-07-31-m11-interrupt-everything.md` — clean in
all three tiers (scroll+density, scroll/seek+sort, sort+query-change, and a
tier-specific rapid double-interrupt of the extend/seek mechanism — 8
scenarios total across two-tier and seek, plus the earlier scroll-tier pass).
Every interrupt resolved deterministically (later action wins, no torn
state).

---

## 10. Findings — Format and Home

One home: `kupua/exploration/docs/wandering-findings/`. A finding is a
`.md` file. If it also gets a repro spec (see below), it lives right next
to it with the **same filename stem**:

```
kupua/exploration/docs/wandering-findings/W-2026-07-30-seek-idempotence.md
kupua/exploration/docs/wandering-findings/W-2026-07-30-seek-idempotence.spec.ts
```

These `.spec.ts` files are **not** picked up by `npm run test:e2e` (they're
outside the configured `testDir`, and outside `e2e/` entirely) — they are
proof, not suite members. To run one you will need a small config; model it
on `playwright.run-manually-on-TEST.config.ts` (no `globalSetup`, longer
timeouts). Ask before adding it to the main suite.

**Write a repro spec only when it earns its keep — not for every finding.**
A spec is dead weight if the finding turns out refuted (delete the finding,
delete the spec) or gets fixed in the same session (the fix session's real
regression test supersedes it). It pays off only when a finding is real,
unrefuted, and will plausibly sit unactioned for a while — write one then,
or when the repro steps are genuinely fiddly to redo from prose alone. When
in doubt, skip it; the prose repro in the finding is usually enough.

### Finding template

```markdown
## F1 — <one-line title>

**Oracle:** 7.2 self-consistency (do X, undo X → different state)
**Confidence:** high | medium | low
**Bed:** TEST, seek tier
**URL:** /search?nonFree=true&until=2026-03-04T00:00:00Z
**Focus mode:** explicit

**Repro**
1. …
2. …

**Expected (per oracle):** anchor returns to image `abc123`
**Observed:** anchor is `def456`, ~40 positions later

**User-facing impact:** after opening an image and coming back, the user is
roughly two rows below where they were. Mild disorientation; not data loss.

**Evidence:** store state before/after; console clean.
**Repro spec (optional — see above):** `W-2026-07-30-<slug>.spec.ts` — fails at line N.
```

**User-facing impact is mandatory.** One or two sentences, plain language, no
severity score. You do not know the users; you do know what the screen did.

**Volume expectation:** 0–6 findings in a session. Zero is a legitimate and
useful result — say so plainly. More than about eight means you have started
reporting opinions; re-read §1 and cut.

**Low-confidence findings** are included only if the observed behaviour was a
hard signal (7.1) or a clear self-contradiction (7.2). A low-confidence hunch
resting on 7.4 gets dropped — the relaxation table means you are probably wrong.

**If your own later analysis refutes an earlier finding, delete it.** Do not leave
a refuted entry with a note attached.

---

## 11. What Done Looks Like

Before declaring the session over, confirm:

- [ ] Traps were armed at the start and re-armed after every navigation/reload
- [ ] Storage was cleared before the mission (except where restore was under test)
- [ ] The exact URL, bed, tier, and focus mode are recorded
- [ ] Every finding names an oracle from §7
- [ ] Every finding was checked against the §8 do-not-report list
- [ ] Every finding has a user-facing impact sentence
- [ ] Findings that could be reduced to a repro have a matching spec; ones that
      could not are labelled **"not reproducible — observed once"** and marked low
      confidence
- [ ] Off-scope observations are in the appendix, capped at 10 lines
- [ ] No screenshots written to disk; no unredacted sensitive values
- [ ] `embedded-browser-playbook.md` updated (§12) — **not optional**

**Halt conditions.** Stop and report rather than pressing on if: the tunnel dies,
the app fails to load, the store hooks are absent (you are on a prod build), you
cannot establish a stable corpus, or the mission's premise turns out to be wrong.
A short honest report beats a long invented one.

---

## 12. Feed the Playbook

The last action of every session is to append what you learned about *driving the
app* — not about bugs — to `embedded-browser-playbook.md`: selectors that worked,
selectors that lied, waits that were necessary, cheap state reads you discovered,
techniques that wasted turns.

That file is the compounding asset here. The findings are one-offs; the technique
notes make every future session cheaper. A session that finds no bugs but adds
three solid playbook entries was still worth running.
