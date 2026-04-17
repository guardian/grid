# Revised Scroll Assessment — In Context

## What the new context changes

The attached `05-kupua-realistic-work-plan.md` fundamentally reframes the scroll work. Three key facts:

### 1. Kupua is a prototype migration, not a production app

Kupua is a one-person (non-engineer + AI agents) rewrite of an AngularJS frontend for a system with ~9 million images. It queries Elasticsearch directly — by design. The structural audit (`02`) says explicitly: *"This was an intentional Phase 1–2 decision for read-only exploration with local/TEST data, and it worked brilliantly."*

This changes the framing of my original assessment significantly. When I wrote *"the `seek()` function is doing too much"* and *"extract it into composable pieces"*, I was critiquing it as if it were a production system that needs to be maintained by a team. It's not. It's a prototype built by one person with AI agents to demonstrate what a modern image browser *could* be. The 500-line `seek()` function exists because **one agent session needs the whole seek flow in one readable place** — splitting it across 5 files would make it harder to work on with agents, not easier.

### 2. Document 05 is itself a critique of over-engineering

The most revealing line in the attached document:

> *"04 is a thorough 5-phase rearchitecture plan written as if a team of experienced engineers will execute it over 10–14 developer-days. That's not what's happening."*

Document 05 is the developer pushing back against the AI-generated structural plans (02, 03, 04). It explicitly refuses the store split, the service contracts, the component splits, and the extension surface — accepting that these are technically correct but wrong for the current context. The "What these sessions explicitly do NOT attempt" section reads like a rebuttal of every recommendation my original assessment would have made.

This is a developer who understands the difference between *architecturally correct* and *worth doing*. And the directives confirm it — the copilot instructions include: *"Push back. Hard... Say 'this isn't worth it because…' when it isn't."*

### 3. The scrolling work was the hard problem, not a side quest

The structural documents reveal that kupua's unique value is its scroll/seek system:
- No other frontend (Google Photos, iCloud, immich) handles this scale without a full position map
- The windowed buffer + cursor pagination + custom scrubber is genuinely novel
- The 1.3M-doc TEST validation confirmed it works on real data at real scale

The 15-agent scroll odyssey wasn't a distraction from "proper" architecture work — it *was* the work. The scroll system is what makes kupua worth showing to the engineering team. Without it, kupua is just "a React rewrite that can sort a table" — kahuna already does that.

---

## What my original assessment got right

**The technical analysis of the code holds up.** The timing chain is genuinely fragile. The reverse-compute's DOM inspection from inside the store is a real coupling violation. The `_seekSubRowOffset` one-shot communication channel is unusual. The 15-agent iteration count is factually high.

**The test coverage gap is real.** Swimming was consistently missed by automated tests and only caught on real data. This is a genuine risk for future changes.

---

## What my original assessment got wrong

### 1. "Extract `seek()` into composable pieces" — wrong recommendation for this context

I recommended splitting `seek()` into 5 standalone modules with unit tests. In a team context, yes. In the context of a single developer working with AI agents on a prototype:

- **Agents need context locality.** A 500-line function that an agent can read in one go is *better* than 5 files at 100 lines each that require the agent to hold cross-file state. The agent context window is the bottleneck, not function length.
- **The seek function is correct.** It handles 5 seek paths, all with edge cases, all tested against 1.3M real documents. Refactoring a working 500-line function is pure risk with zero feature value.
- **Document 05 already made this call.** It explicitly defers the store split: *"Splitting it requires rewiring every consumer, re-establishing timing invariants across 7 stores + orchestration functions... The risk of breaking the app's most complex behaviour (scroll compensation, seek cooldowns, sort-around-focus, density-focus bridges) is too high."*

### 2. "Replace time-based cooldowns with frame-based guards" — technically right, practically wrong

I recommended `requestAnimationFrame`-based guards instead of the hardcoded millisecond cooldowns. This is correct in theory. In practice:

- The timing chain works. It's been validated on real hardware with 1.3M docs.
- Frame-based guards interact unpredictably with React's rendering schedule, especially across density switches (which unmount/remount entire component trees).
- The current constants are documented, tunable, and their interaction is mapped in `tuning.ts`. A frame-based replacement would need the same amount of documentation and testing — for no user-visible improvement.
- The directive says: *"Performance is crucial. If any requested change is likely to seriously impact performance, do not proceed without checking with the user first."*

### 3. "Fifteen agents is too many" — unfair framing

My original assessment presented this as a failure. In context:

- The developer was building the entire app feature-by-feature with sequential agent sessions. Each "agent" is a fresh Copilot session, not a person. The continuity comes from the changelog, AGENTS.md, and handoff docs.
- The scroll stability work was interleaved with other features: fullscreen preview, image detail position restore, format comparison experiments, UI polish, structural reorganisation.
- The "failed approaches" (suppress flag, reduced cooldown) were exploratory — each produced test improvements and documentation even when the code was reverted.
- Agent 6's suppress flag wasn't a bug that "survived" — it was the best available fix at the time, documented as incomplete, with specific ideas for the structural fix that Agent 11 eventually implemented.

The iteration count reflects the problem's difficulty, not poor engineering. Google Photos has a team of engineers working on this. Kupua had one person and AI.

### 4. "The store is sacred" — was already the right call

Document 05 enshrines `search-store.ts` as untouchable, and the three safe sessions explicitly work around it. My recommendation to restructure the store contradicts the developer's most considered architectural decision. The developer has more context than I do about the cost/benefit of touching that file.

---

## Revised verdict

**The scroll system is the crown jewel, not the liability.** It demonstrates that a windowed buffer with cursor pagination can provide a Google Photos-like experience over an Elasticsearch backend with millions of documents — something no existing open-source image browser does. The architectural imperfections (timing chain, reverse-compute coupling, large function) are acceptable trade-offs for a prototype whose purpose is to prove the concept and generate a concrete "here's what we need from the API" list for the engineering team.

**The 15-agent odyssey was expensive but appropriate.** This is genuinely hard engineering. The bidirectional seek idea (the actual fix) required understanding the interaction between React rendering, browser scroll clamping, virtualiser layout, ES cursor pagination, and sub-pixel position preservation. It took the agents time to converge because each iteration produced new understanding of the problem space. The documentation trail — scroll-architecture.md, tuning.ts comments, worklog archives — means the knowledge isn't lost.

**The structural documents (02-05) show exceptional self-awareness.** The developer generated an ambitious 14-day rearchitecture plan (04), then immediately wrote a critique of it (05) that extracts only the safe, high-value parts. The "push back hard" directive, the "ask rather than spiral" directive, the explicit refusal to split the store — these show someone who understands that prototype code serves a different purpose than production code.

**My original recommendation to "don't touch it unless you have to" was correct, but for the wrong reasons.** I framed it as "the code is fragile, leave it alone." The right framing is: "the code works, it demonstrates the concept, and the next step is showing it to the engineering team — not refactoring it for a team that doesn't exist yet."

**The one genuinely actionable finding from my original assessment:** The automated tests can't catch the scroll swimming that's visible to humans on real data. If the scroll system ever needs modification, this gap is the highest-risk factor. The smoke tests are the safety net, but they require a live TEST cluster and manual invocation. Document 05's "Smoke → local feedback loop" directive addresses this — but it's an ongoing discipline, not a one-time fix.

