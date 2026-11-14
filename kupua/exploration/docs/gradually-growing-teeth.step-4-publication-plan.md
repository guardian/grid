# Step 4: Fresh Edits Without Losing Your Place

**Implementation plan, 5 November 2026. The operator accepted Unit D and the
Step-4 simulated foundation on 7 November after integrated validation and independent
review. Units A-D are complete within the documented scope and limits. Step 5 and
live activation require separate authorization. Earlier blocked/spike narratives
and historical checkpoint authority statements are superseded by this acceptance.**
This expands [editing Step 4](gradually-growing-teeth.kupua-edits-steps.md#step-4-resolve-kup-043-with-simulated-writes-before-enabling-real-ones)
and [KUP-043](bug-backlog.md#kup-043), after the completed disconnected desktop editor.
The original proposal rested on independent read-only source reviews. Implementation
checkpoints below record subsequent executed evidence, not deployed-service certification
or performance qualification.

All work stays inside `kupua/`. No live writes, service/safeguard changes,
deployment, dependency addition, staging, commit or push follows from this plan.
The operator runs e2e-perf campaigns after meaningful steps; current smoothness
is the acceptance baseline, not an aspiration.

### UX Invariants (Operator, Non-Negotiable)

- Scrolling stays as smooth as now. Background publication, late reads and bookkeeping
  must not move the visible neighbourhood. Deliberate deletion may authorize visible
  removal and reflow under section 5.6; late completion must respect newer browsing input.
- Seeks need not land with Swiss-watch precision (the scrubber is approximate),
  but must never land nowhere, millions away, or crash the app.
- Where the user can see the whole result set, show the truth: deleted or
  filter-exited images disappear (section 5.6).
- How far "better than Kahuna" goes beyond these is decided by the operator after
  seeing each unit, not specified up front.
Normal editing stays disconnected. Removal transport belongs to step-5 preparation;
production batch execution belongs to step 6.

## 1. Recommendation and Authority

**Publish authoritative content into the existing view. Preserve local browsing
even when global rank knowledge is stale. Resolve current membership or position
only where the action's actual meaning requires it.**

Do not globally refresh the search after each edit. Do not build a second scrolling
engine, a general entity cache, a universal freshness service or a job platform.
Do not make the user learn a new refresh control to keep browsing correctly.

### Confirmed Operator Decisions

- Preserve Home logo behavior, including its defaults, selection/focus clearing,
  navigation and density intent rules.
- Preserve the New images ticker and existing refresh behavior, including its
  current-query top reset and selection-clear policy. Pull-to-refresh is not
  repurposed into an anchored edit refresh.
- No new user-invoked "refresh this view" control is selected.
- Browser reload keeps existing navigation semantics. It is not a required
  repair action, operation retry or promise of receipt/draft recovery.
- Performance and existing scroll/seek/position preservation are acceptance
  requirements, not optional improvements after editing works.
- A distant change in a millions-image result set must not interrupt scrolling
  merely to repair global bookkeeping. Stable local presentation takes precedence
  over imperceptible corrections to ranks, totals and thumb position.
- Implementation acceptance includes an agent-driven embedded-browser rehearsal
  the operator can watch, as well as automated tests. Section 8 owns that sub-plan;
  no live-system testing is authorized. Fixture pieces are built only within the
  authorized session that needs them, not as an up-front general harness.

### How to Lie Beautifully

The operator's clarification is a product requirement, not permission to conceal
failed writes or authorization. If an image changes 650,000 places above someone
browsing nine million results, they should keep scrolling through their current
neighbourhood. Repairing its exact ordinal is a code concern, not a reason to jump,
wait for a rank query, lose useful prefetch or display an alarming stale-state banner.

Use a coherent retained display coordinate system and approximately informative
scrubber instead of chasing corrections with no perceptible navigation benefit.
Do not invent a new pixel-error threshold, distance-based permission rule or second
full catalogue index. A stale rank can remain useful as a positioning hint without
being promoted to exact server rank. A shift-range target set, image identity,
permission or mutation outcome cannot be treated that way.

With five results there is nothing to lie about and no reason to: if two are
deleted the user sees three. Stability exists to protect a scrolling viewport,
not to preserve slots nobody needs. Section 5.6 owns the compaction rule.

**Do not globally invalidate coordinates or rebase at every edit boundary.**
Ordinary continuation is not automatically an exact-rank operation, including after
an observer expires. Establishing bounded, correct continuation is a required design
and test discriminator, not approval for an indefinite frozen enumeration.

### Accepted Choices

Accepted plumbing choices. Section 5.6 separately records the contextual deletion
workflow direction; that direction is not permission to implement the later Delete UI.

| Choice | Recommendation | Consequence |
| --- | --- | --- |
| First observation path | Bounded mget readback with exact returned-label comparison; no mandatory count-first hop | Correct for labels the query language cannot express exactly; potentially more response bytes, fewer dependent requests for one image |
| Global rank stale during ordinary browsing | Continue from retained scan frontiers in stable display coordinates; keep useful lookahead | No rank/count/rebase tax solely for distant changes or an unresolved receipt; prove overlaps, exhaustion and eviction separately |
| Scrubber input across invalidation | Preserve track/drag fraction; preserve an explicitly requested numeric ordinal as an ordinal, never as an image identity | A changed total can change the resulting numeric position; existing approximate deep landing remains approximate |
| Range endpoint leaves the query | Refuse that off-window range without changing the current selection | Never substitute a different endpoint or silently choose a subset |
| Unavailable slots | Current plumbing compacts confirmed deletion when the whole set fits; otherwise retains slots and skips terminal traversal targets. Section 5.6 distinguishes future deliberate deletion, background publication and harmless offscreen cleanup | No loading skeleton or inferred deletion; current plumbing is not the final Delete-button experience |
| Initial resource budget | One active single-label simulated observation group, at most 200 captured IDs; three mget attempts, at least one second apart, ten-second deadline starting immediately before first fake dispatch | Prototype proof bounds, not a write-capacity certificate or a production batch scheduler; disconnected comma-separated preparation is unchanged |
| Freshness-fact lifetime | Document-lifetime metadata floors for at most 1,000 distinct touched IDs; refuse new simulation admission at capacity | No silent eviction of freshness protection; browsing stays usable, no compulsory reload |

**Step-6 composition:** connected labels use at most 100 targets with one group,
the existing 200-ID admission cap, three grouped attempts and 1,000 touched IDs.
Unlike the simulated ten-second proof above, paced connected execution has a 120-second
dispatch bound and up to ten seconds of final observation, capped at 130 seconds from
activation. After an early read, remaining attempts wait for dispatch to settle. Waiting
operations start no clocks until activated. Deadline expiry stops unsent work while
dispatched writes retain their eventual outcomes. Early verified bodies publish without replaying commands. Unsent
admission reservations are released without discarding newer read evidence. See the
[current batch contract](../../src/dal/grid-api/README.md#step-6-bounded-label-execution).

The numerical limits above are deliberately conservative initial defaults, not
benchmarked optima. They bound new observation work, not selected membership,
existing dry-run receipts or the whole application heap. The operation target limit
is independent of the 5,000 selection-metadata/range limits and step 6's prospective
write ceiling. No product UI cap is introduced by documenting fixture admission.

**Important distinction:** unconfirmed writes retain uncertainty after observation
stops, but uncertainty is not a global browsing lock. Exact membership/rank consumers
must not trust stale authority; ordinary cursor browsing can continue with retained
display positions. No indefinite polling, repeated rank refresh per page, disabled
prefetch or compulsory reload may be justified only by that uncertainty.

The completed Unit B feasibility spike and implementation (section 7) establish the
separation of scan frontiers, display slots and trusted ranks in existing owners.
Further work needing a second enumeration engine, unbounded visited IDs or material
browsing cost must stop for a design decision.
Do not fall back to rebasing at every dirty boundary.

## 2. Why This Work Is Needed

The disconnected editor already records what the user intends and can simulate a
server acknowledgement. It does not update image data. Connecting a real save
without this work would leave several independent copies of the image disagreeing.

Consider adding `reviewed` while browsing images that do **not** have that label:

1. The server accepts the write, but search still contains the old projection.
2. The label becomes visible later. The image now no longer matches the search.
3. Rebuilding results immediately can remove the image and shift its neighbours.
4. Keeping everything untouched preserves position but shows stale metadata.
5. An older request completing afterward can restore the old label or capabilities.

Sorting by `lastModified` creates the same problem without a label filter: a
metadata edit changes the sort key. The frozen upload-time boundary excludes new
uploads, not edits to existing images. A PIT would hide the user's edits and is not
the selected answer.

The requirement is therefore not merely "reload the label". It is to separate:

| Fact | Owner/meaning |
| --- | --- |
| Command outcome | Was this operation acknowledged, rejected or left uncertain? |
| Observed image state | Does an authoritative read actually contain the intended change? |
| Display position | Which retained slot is this image occupying in the current view? |
| Server ordering | Where does it now belong in this query, and can cached coordinates still be trusted? |
| Presentation intent | Where did the user ask to go, and does that request still own placement? |

These can change at different times. Preserving their distinction is less risky
than making every edit behave like a new search.

## 3. Existing Foundation to Preserve

### Scrolling and Layout

The default regimes are resident at up to 1,000 results, indexed at 1,001-65,000,
and seek above 65,000. Thresholds remain configurable. Indexed coordinates depend
on `total`, not position-map arrival. A count crossing either threshold must not
flip coordinates underneath retained content.

Grid and Table use fixed rows; Grid's global row membership already preserves
surviving visible boxes during ordinary window maintenance. Justified uses
dimension-dependent packing and identity-based compensation, with 48-image
technical blocks and bounded dimension context. Metadata-only publication must
not introduce repacking or movement, but this project does not claim to eliminate
the existing Justified boundary-repacking limitation during normal extension.

Preserve null/valued cursor crossings, all-null results, true ends versus temporary
buffer limits, complete pages, bounded eviction, directional demand, cooldowns,
pending navigation across density changes, zoom and transition-specific anchors.
The scrubber's literal top-edge dead zone is already handled by continuous pixel
sync; it is not a new feature to implement here.

### Data Topologies

Direct ES remains a functional, explicitly selected, read-only laptop path. Local
media-api and deployed media-api use the same API datasource and no ES fallback.
Hosted compiled pages consume validated injected configuration and canonical media;
they are a separate build/transport witness, not another scrolling implementation.
Local API browser fixtures and compiled-hosted fixtures do not certify deployed
cookies, CORS, CSRF, installed backend versions or performance.

### Existing Ownership

Search owns the buffer, ranks, maps and acquisition lifetimes; views own physical
placement. Selection owns IDs and a separate metadata LRU. Standalone detail owns
its requested-ID-bound image and overlay. Server enrichment follows its accepted
image response. The label operation owns immutable intent and a receipt outside
selection state. Keep these responsibilities rather than moving all data into a
new normalized cache.

History snapshots contain an anchor, placement and coordinate hints, not image
bodies or capability maps. The task is to protect restoration reads and qualify
old hints, not migrate imagined snapshot content.

### What Production Kahuna Does

Source-read, not executed. Kahuna serves hundreds of users with far less machinery:

- **Readback:** after each write it polls the image (`getSynced` -> `apiPoll`, about
  500 ms backoff, up to 100 retries) until a check function sees the change
  ([edits/service.js](../../../kahuna/public/js/edits/service.js#L61),
  [async.js](../../../kahuna/public/js/util/async.js#L56)). No version checks.
- **Publication:** emits `images-updated`; the results controller replaces the image
  by ID at the same index; panels listen to the same event
  ([results.js](../../../kahuna/public/js/search/results.js#L831)). Batches emit once at the end.
- **Deletion:** removes the image from the list, shifts later positions and decrements
  the total; no rerun ([results.js](../../../kahuna/public/js/search/results.js#L870)).
- **Filter exit, sort changes, totals after edits:** ignored. The image stays until
  the next search.
- **Batch:** 30 concurrent requests, `allSettled`, a progress bar
  ([batch-tracking.js](../../../kahuna/public/js/util/batch-tracking.js#L5)).

Lessons: replace-by-ID at the same slot, one grouped event per batch and local
removal of confirmed deletions are proven at production scale and should be
reused. Ignoring filter exit and sort drift is tolerated by users. Kahuna's
splice-on-delete in a scrolled list and its re-filtered render list are plausible
sources of the visible cell jumping Kupua must avoid. Its polling without version
checks and its `allSettled`-as-success batches are not to be copied.

## 4. User-Visible Contract

### While Staying in the Current View

- Accepted readback updates the affected image and its authoritative capabilities
  in place. Unchanged images keep their references and positions.
- An edited image that leaves the filter remains in its retained slot until an
  ordering-changing action reacquires the view, except where the whole result
  set fits the viewport (section 5.6). Its selection and receipt targets
  are not silently removed.
- Distinguish "membership may have changed" from a confirmed filter exit. Do not
  implement a second CQL evaluator to guess arbitrary membership in the browser.
  If exact per-target membership is displayed, obtain it through an admitted,
  bounded server query; otherwise show only the uncertainty actually known.
- Retain useful counts, distribution labels and thumb position as presentation
  estimates when exactness is not needed. Do not surface harmless distant drift as
  an error or force a visible update for sub-pixel bookkeeping. Where stale membership
  affects the user's decision, qualify it quietly on existing results/receipt
  surfaces; never advertise it as newly verified exact state. Exact copy/placement
  is reviewed in the small-set and distant-change fixtures, not a diagnostic block
  in the label row or a new refresh button.
- Acknowledged does not mean observed. Deadline/failure does not mean rollback.
  Unknown command outcomes remain unknown even if the desired state is observed.

### When an Action Needs Current Ordering

"Reacquire" means fetching sufficient current membership/order for an action that
actually needs it, then publishing its data and placement coherently. A buffer
crossing or an uncertain operation alone is not such an action. This is not a new
user command. The following table is the proposed action policy:

| Action | Intended destination | Preservation and failure |
| --- | --- | --- |
| Metadata publication only | No new destination | Keep current slots, extent, focus, selection and viewport; emit no seek/reset/arrival signal |
| Resident scroll, arrows, density, zoom/reflow | Current displayed identities | Existing geometry and focus rules; no rank read merely to move inside retained content |
| Wholly resident selection range | Captured displayed IDs | Range follows displayed order; terminal unavailable slots are not new selectable targets; existing selection is retained |
| Ordinary boundary extension | Next/previous results from the retained scan frontier | Preserve survivors and lookahead using display coordinates; no mandatory rerank/rebase because a distant edit changed global ranks |
| Off-buffer focus or detail traversal | Captured image identity plus movement | Continue adjacent traversal through the existing frontier; an actual identity lookup resolves that identity, not an old rank hint; no unrelated anchor substitution |
| Scrubber track/drag | Captured fraction through the admitted display extent | Existing approximate landing remains valid; obtain fresher scope only when needed by the chosen seek path; explicit focus remains a bookmark |
| Explicit numeric seek | Requested ordinal | Clamp against fresh bounds and use existing seek accuracy; the number is intent, not evidence of identity/rank |
| Indexed viewport outside the buffer | User destination or maintenance refill in retained display coordinates | Stale map entries may guide identity/cursor acquisition, never certify current rank; filling must not trigger a whole-view rebase merely because global ordering changed |
| Home / End keys | Current first/last edge | Preserve the initiating permission to change focus; do not inherit Home-logo defaults or selection clearing |
| Home logo | Existing default-search/top behavior | Existing focus/selection, density-intent and failure/navigation rules unchanged |
| New images ticker / pull-to-refresh | Existing current-query/top behavior | Existing admission-boundary reset, selection clearing and pending/failure retention unchanged |
| New query / sort | Existing captured continuity | Existing target precedence, neighbour/top fallback and selection-clear policy unchanged |
| Back / Forward / reload | Destination snapshot identity and ratio | Re-resolve invalid hints; missing destination anchor keeps existing top/no-focus policy, not departing neighbours |
| Off-window range | Both captured endpoint identities | Resolve fresh tuples under one current range owner; missing endpoint or required-read failure changes no selection |
| AI result editing | Existing finite result membership and relevance | No automatic AI rerun or rerank; explicit supported local sorting remains local |

Local continuation preserves the upload-admission cutoff and selected IDs. It is
not an opportunity to admit new uploads, clear selection or reconstruct the current
neighbourhood. Keep speculative lookahead when its cursor/ownership remains usable;
do not convert it into permission to reposition, nor disable it merely because a
global-rank flag is stale. No new permanent DOM observer is required.

If continuation genuinely cannot establish a usable next page, retain the view and
use a bounded existing recovery/error path without claiming success. A recovery
requiring neighbourhood replacement needs an explicit design decision and proof;
it is not an automatic fallback for ordinary stale coordinates. A later user action
may try again. No automatic retry/rebase loop or compulsory reload follows.

An explicit query/order/navigation transition may legitimately replace neighbours
while preserving its action-specific anchor or destination. That relaxation must
not leak into scrolling, detail traversal or metadata publication.

## 5. Proposed Implementation

### 5.1 A Small Observation Owner

Extend the existing label operation/receipt path with an injected readback observer
for simulation. The normal disconnected path still dispatches no commands or
observation reads, regardless of rollout flags. Do not import the real executor
into the editor to make tests convenient.

Capture the full target IDs, exact intended label and operation identity before
fake dispatch. Admit at most one active simulated observation group within the
proposed target budget; excess/overlapping execution is explicitly refused, not
queued, truncated or silently replayed. Normal dry-run intent preparation remains
unchanged. This is not step 6's production scheduler.

For this initial single-label simulation, preflight an entire comma-separated submit
before invoking any executor: refuse multi-label execution with an explicit fixture
outcome and retain the draft. Never dispatch the first label and then refuse the
second through the current `labels.every(...)` loop. Normal disconnected multi-label
preparation stays unchanged. Grouping several label predicates is separate scope.

Start the ten-second observer clock immediately before the group's first fake
dispatch, not after `confirm()` or its `Promise.all` resolves. Observe IDs whose
outcomes are acknowledged or unknown while other group items may remain submitted.
Publish verified partial readback at the budget boundary, retaining each item's
actual transport outcome. Rejected/blocked items are not polled to manufacture success.

Observation owns its requests and deadline independently of search/scroll
cancellation. SPA navigation or selection clearing cannot retarget it. Deadline
settlement releases the observation-group admission slot and cancels its reads;
it does not cancel outstanding commands or permit replay. Still-submitted/uncertain
same-ID work continues to block conflicting simulated dispatch until explicitly
reconciled; late command outcomes update their receipt without restarting an expired
observer. Lost document/observer ownership stops readback, not a mutation that may
already have occurred. Held fixture executors must always be released in cleanup.

Keep transport outcome and observation evidence separate. Preserve existing rejected,
unknown and blocked results. Add only the observation disposition/reason needed to
distinguish pending, observed, deadline, unavailable and superseded work. A confirmed
postcondition is not proof this command caused it; the label may already have existed.

### 5.2 Readback: Documents First for the Initial Label Proof

**Accepted replacement for the original count-first direction:** use bounded
`POST /images/mget` and compare the normalized returned label exactly. Three
attempts maximum, one logical read in flight, at least one second between attempts,
with a ten-second elapsed deadline. Reuse existing 200-ID chunking and cancellation;
do not add an independent singleton poll per target. Empty captured IDs dispatch
nothing. A required read failure stops observation with a recognizable outcome.

Why not require count first? Current structured label filtering uses a root `labels`
field while the mapping owns `userMetadata.labels`; its parser is CSV-shaped.
Quoted CQL also rewrites the phrase `Added to Photo Sales`. Existing label pills can
contain values not safely represented by a generic query encoder. Source pointers
are in Appendix B. These findings do not authorize a backend fix or narrowing the
editor's accepted values merely to make the observer work.

A future count optimization must prove exact literal semantics and admission scope
for its supported subset. It must use captured IDs, omit browse filters/default
free scope/frozen boundaries, preserve server authorization, and remain bounded and
cancellable. A matching count is only a reason to fetch documents: the returned
documents must independently satisfy the postcondition before publication. A zero
count is neither proof of deletion nor permission loss. No count optimization is
necessary for the first one-image proof.

Accumulate verified documents during the bounded observation and publish one group
at completion or the observation budget boundary. Mixed outcomes stay per-ID; there
is no all-or-nothing operation claim. Intermediate progress must not replace the
result array once per target. Do not publish invented label scalars as if they were
authoritative entities.

### 5.3 Same-Image Freshness Across Read Owners

Use a small registry of **facts about touched IDs**, not another collection of image
bodies. It owns the operation fence and metadata projection floor. Capture read
issuance before awaiting, including search reads whose returned IDs are not yet
known. Existing query, range, selection and requested-ID owners still decide whether
a completion belongs to them; the new check adds own-write freshness, not a global
replacement cancellation epoch.

The minimum evidence is operation identity, a local read/operation ordering token,
available metadata source/projection version, projection kind and observation state.
Inspect only touched IDs at image-publication boundaries. With no retained fences,
the path returns immediately: no scroll-time/per-cell scans or new subscriptions.

Also apply the fence to **omission side effects**, not only returned images. An old
hydration that omits a touched ID must not remove it, re-elect the anchor or consume
toast ownership after newer canonical publication. Ordinary cold-start hydration
omission rules remain; do not globally disable them. Captured requested IDs identify
the protected omissions even when no image body is returned.

Admission rules to prove:

1. A response issued before an admitted operation cannot overwrite newer accepted
   own-write state for its affected IDs. Unrelated images remain usable.
2. A later response below an accepted metadata projection floor cannot restore the
   older metadata, even after navigation or receipt completion.
3. A genuinely newer accepted metadata projection can change the label again. Do not
   preserve an operation's label forever or mistake historical observation for a lock.
4. Missing/equal timestamps do not uniquely order operations. Contradictory evidence
   stays unresolved; never compare a server timestamp to the browser's wall clock.
5. Version facts survive ordinary search replacement for the document lifetime.
   They contain no image bodies, media URLs, principal identity or credentials.
   Refuse further simulation before the proposed distinct-ID capacity is exceeded;
   do not silently evict protection while claiming it still holds.

The command response currently contains no source version. The observer must not
invent one. Root `lastModified` is not a substitute for the metadata projection
clock, and neither metadata clock versions capabilities, leases, crops or deletion.

In particular, a current read may carry older metadata but newly absent permission.
Do not keep an old positive grant merely because the body was rejected by the
metadata floor. Current negative authority must withhold editing; disputed authority
is unavailable, not a reason to union old links back in. A later admitted positive
snapshot requires its own current ownership. Pre-dispatch capability revalidation
for real writes remains step 5's responsibility.

If a below-floor image arrives after its previous body has been evicted everywhere,
there is no hidden canonical cache to recover it from. Represent it as unresolved
and permit bounded current readback when demanded; do not present the older body as
fresh. Persistent external-edit freshness and cross-tab/account/reload guarantees
are explicitly outside this contract.

### 5.4 Publish Through Existing Owners

Stage one accepted per-ID publication, then notify the existing consumers. Do not
rely solely on React batching to establish coherent body/capability ownership.
Each consumer must recognize the same accepted publication or keep its explicitly
stale prior presentation. Mark receipt observation only after applicable publication.

| Consumer | Required update |
| --- | --- |
| Resident search | Replace affected bodies at the same slots; preserve unchanged references, `imagePositions`, extent, cursors and placement signals for a content-only update. Unit A's A2 session compares this with per-cell publication before choosing |
| Browse enrichment | Replace affected authoritative entries, including empty capability lists; no union of removed grants and no indiscriminate insertion of off-screen targets |
| Selection metadata | Replace cached selected targets through a deliberate publication action, advance one metadata revision, request at most one existing full reconciliation |
| Selection membership | Leave selected IDs, anchor and captured operation targets alone; do not call `hydrate()` as post-write refresh |
| Panel presentation/capabilities | Update both rendered metadata and action admission; route-local capability resolution must not choose an older shared overlay over newer attached data |
| Standalone detail | Deliver only to the still-current requested-ID owner; retain the full-read projection contract and reject older same-ID completions |
| AI | Replace canonical fields while retaining the list-owned relevance ordinal and finite membership; no ordinary pagination or reranking |

Mget omits original metadata/file metadata that singleton detail can possess.
Do not replace a full entity with defaulted lean `{}` fields or solve this with an
unqualified object spread. For a currently open standalone target, the initial
recommendation is **one bounded full singleton follow-up** after matching mget,
using the same cancellation/deadline and checking postcondition/version again.
Publish that full entity for the target if it passes. This costs at most one extra
read per observation group, not one per selected target or per polling attempt.

If the full follow-up fails or contradicts readback, keep that target unconfirmed
for publication with its prior presentation marked stale/unavailable for editing;
other verified targets may publish. If the detail owner departs, it no longer gates
publication to surviving owners. A newly mounted detail performs its existing owned
read with the same freshness checks. Projection-aware field replacement is an
alternative only if it has a precise field contract and removes more complexity
than it adds; do not implement both.

### 5.5 Coordinate Trust Without Browsing Disruption

Treat display slots and server rank authority as separate facts. Retain the committed
display extent while invalid. Do not clear `imagePositions` merely to advertise
staleness: local geometry still needs it. Do not change `total` independently of the
replacement window and placement when crossing a regime boundary.

Introduce the smallest store-owned ordering revision/validity needed for own writes.
Invalidate coordinate acquisitions at admitted dispatch, and again when accepted
canonical observation reveals a new projection. Blocked/pre-dispatch operations do
not invalidate anything. A definitely rejected dispatched operation makes no content
publication; conservative coordinate invalidity can remain until the next demanded
acquisition rather than introducing a rollback state machine.

Fence pending position maps, ranks, primary/null distributions, coordinate-derived
refills, range walks and retained cursor/offset hints, not just the visible stale
flag. Query fingerprints alone do not distinguish pre-edit and post-edit membership.
Late work cannot restore invalid authority or clear a successor's busy state.

Preserve the requested destination separately from an obsolete acquisition. Calling
`abortExtends()` indiscriminately would also retire browsing. Invalidate a rank claim
without discarding still-useful cursor work merely because it was started earlier.
Affected image bodies still pass the own-write freshness fence. An action that needs
current membership/identity resolution keeps its existing browse/range/focus owner,
subject to newer input. Layout effects consume ready placement; the observer never
writes `scrollTop`.

An ordering acquisition during unresolved observation can establish a current-at-read
view, but does not settle the operation or discharge possible future order changes.
Deadline, failed read and a held/unknown command retain that uncertainty even when
no observer remains to deliver a later invalidation. Subsequent exact-rank/membership
consumers cannot reuse old facts as settled authority. This does not require reranking
ordinary continuation: local slots, cursor frontiers and useful prefetch remain usable
without knowing the exact number of images above the window.

Keep desired-state observation separate from evidence that ordering has settled.
An already-present label, a matching count or a timestamp advance caused by some
other edit is not operation-specific projection-completion evidence. The existing
acknowledgement-only command cannot provide a universal completion watermark.
Do not clear uncertainty on that assumption. A later supported source/projection
contract can discharge it; supplying such a contract is a step-5 decision if live
activation needs it, not an implied backend project in this simulated step.

Separate "operation pending/unconfirmed" from "coordinates acquired for this
particular action". Later accepted canonical publication invalidates prior acquisition
as necessary. API reads remain PIT-less/current-at-read, not an exact cross-request
snapshot or a guarantee against arbitrary external edits.

For continuation, retain the response-owned scan frontier independently of refreshed
display fields, including valued/null transitions. Raw-page cursor progress and
display-slot progress are different when an incoming duplicate is omitted. Preserve
survivors' slot/row membership; never compact the existing buffer or overwrite a scan
boundary with an edited image's new sort value. The implementation must specify
frontier retention through eviction and both directions, rather than relying on an
image-keyed latest-tuple cache for both jobs.

Validate incoming overlap before publication. The candidate policy is to exclude
duplicates against the retained window and bounded touched-ID evidence from the
incoming page only, advance the raw scan frontier, and assign accepted additions
consistent display slots. Short/all-duplicate pages require explicit progress and
exhaustion handling: no same-cursor loop, no invented result end from an omitted
duplicate, and no repeated reads merely to fill exactly 200 slots. A bounded fixture
must establish the policy before it becomes an implementation instruction. It does
not promise exactly-once traversal over an indefinitely changing corpus or add a
global visited-ID set.

Likewise, old indexed map entries may supply identity/cursor hints without certifying
new ranks. The placement/mget/window consumer must declare which coordinates it uses
and preserve coherent visible slots. Test map-ready and map-unavailable cases; do
not add a compulsory full-map rebuild or automatically switch tiers. Small results
and true ends need explicit handling instead of extending a fictional total forever.

The feasibility gate is practical: ordinary unaffected local traversal after a
distant change must use its normal cursor read budget and preserve geometry. If that
cannot be achieved with bounded state in the existing owners, stop with the concrete
counterexample and cost alternatives. The old rank-first boundary policy is not an
approved escape hatch. No stronger snapshot or index-migration guarantee follows.

### 5.6 Unavailable and Deleted Entries

Use explicit status distinct from a not-yet-loaded slot. Preserve the unavailable
entry's layout dimensions/slot while withholding media/actions where access is no
longer available. A plain `undefined` would mean a loading skeleton to current
renderers and can leave traversal waiting for a fetch that will never fill it.

Failed reads and successful omissions remain different. Neither mget omission nor
singleton 404 establishes deletion; the server intentionally conceals visibility.
Only explicit authoritative lifecycle evidence can establish confirmed deletion.
Step 4 uses synthetic lifecycle evidence to test publication and retained geometry;
it introduces no delete/restore command or new live endpoint caller.

This is a response to evidence, not deletion discovery. No real Delete button or
cross-browser deletion notification is wired. A fresh search may naturally omit an
image deleted elsewhere, but that omission alone cannot certify its lifecycle state.

Retain selected IDs and operation targets. Disable actions for confirmed unavailable
or deleted targets. If a range contains such slots, its admitted target set and
unavailable accounting must be explicit, not a hidden eligible-subset execution.
Existing operation admission continues to block unresolved/ineligible targets.

**Implemented small-set plumbing.** When the whole result set fits the viewport (no
scrolling is possible), there is no position to protect. Remove confirmed deleted
images locally and decrement the count: no request is needed, because the client
already holds the evidence. Kahuna does exactly this for all deletions. Images whose
membership is only uncertain (for example a label edit under an arbitrary CQL
filter) keep their box with fresh content; the client must not guess CQL. The
fits-viewport fact belongs to the mounted view, not the store.

**Option for uncertain membership in small sets (undecided):** rerun the current
query once after publication, so filter-exited images also disappear. One ordinary
search for at most a screenful; the operator decides after seeing local removal.

#### Contextual Deletion Policy

**Operator clarification, 7 November 2026:** A/B/C are useful in different circumstances,
not mutually exclusive global choices. Product direction is agreed; the interaction
details and implementation of the later deletion workflow are not commissioned here.

| Context | Intended user-visible behaviour | Boundary |
| --- | --- | --- |
| Deliberate deletion in this browser (C-type behaviour) | After successful deletion of one image, an open detail image or multiple selected images, remove confirmed targets from the displayed results and let neighbours close the gaps | This movement is the intended command result, not an accidental background jump. Pending, failed and uncertain targets must not be presented as confirmed deletions |
| Background/external change during browsing (A-type behaviour) | Withhold inaccessible media/actions while preserving the visible neighbourhood and slot dimensions | Do not impose movement merely because new evidence arrived; this policy adds no external-change detection mechanism |
| Offscreen change with no observable disruption (B-type behaviour) | Remove offscreen entries when that cannot disturb what the user is viewing or doing | Offscreen is not automatically harmless: removal can change visible row membership, Justified packing, position, traversal or selection. Defer cleanup when those effects cannot be excluded |

An asynchronous result from the user's own command can arrive after they resume scrolling
or navigate elsewhere. Command origin alone does not authorize a late jump: completion
must respect newer presentation intent. Removing result entries is distinct from changing
selection; background cleanup must not silently discard selected IDs or rewrite captured
operation targets. B is a permitted optimization where harmlessness is established, not
a requirement to scan or compact the whole library.

**Current implementation remains conservative:** Unit C retains scrollable unavailable
slots and performs local confirmed-deletion compaction only for a complete fitting set.
Metadata-only publication never removes those retained slots merely because a later
density change or resize makes the set fit. The C-type explicit-command workflow and
B-type offscreen cleanup are not implemented or authorized by this clarification.

**Paired interaction walkthrough, deferred:** before implementing/enabling the real
Delete workflow in the wider plan's Step 17, the operator and an agent should walk
through single-image, open-detail and multi-selection deletion; partial failure and
uncertainty; completion after resumed browsing; and offscreen changes affecting visible
rows or selection. Decide concretely what remains selected, which image detail shows
next, and where the surviving neighbourhood lands. An earlier design-only walkthrough
can be separately commissioned. Unit D validates the existing plumbing; it must not
absorb this interaction design or its implementation as an unannounced gate.

## 6. Performance Budget and Stop Conditions

The proposed added work is event-driven and finite. It is not free. Expose the
following costs before accepting an implementation:

| Surface | Budget/constraint |
| --- | --- |
| No editing in this document | No observer timer, read, extra render subscription, geometry scan or mandatory navigation round trip |
| Readback | One active group, 200 IDs, up to three mget attempts plus at most one full standalone read, within the observer deadline |
| Publication | One buffer copy only if resident targets changed; one grouped enrichment update; at most one selected reconciliation request |
| Unchanged images | Preserve body/overlay references; no arrival-animation signal or deliberate remount for metadata change |
| Off-screen-only update | No result-array replacement or geometry reconstruction |
| Coordinate invalidation | Constant-size validity/revision update; no eager global count/profile/map rebuild after every item |
| Ordinary continuation | Normal page/lookahead budget after a distant change; no added count/rank/map/rebase read solely to repair global ordinals |
| Exact targeting/recovery | Existing bounded action-owned reads where meaning requires them; no global dirty-state tax or successor recovery loop |
| New retained facts | At most 1,000 distinct touched IDs, no full bodies or signed URLs; no catalogue-wide tracking |

Initial A2 source costs: raw result-array replacement rebuilt Justified layout,
called virtualizer `measure()` and reset the velocity baseline. The corrected A2
buffer route below preserves geometry identity for unchanged-ratio, same-slot
publication only; ordinary page and genuine geometry invalidations remain. Full selection
reconciliation is coalesced but runs in one task and traverses selected membership.
Enrichment upsert copies an accumulated map whose size is not bounded by the current
1,000-image buffer. Existing receipts also accumulate. Do not claim the whole heap
or render cost is bounded merely because this observer is bounded.

First coalesce publication and preserve references. Then characterize a single
publication using existing fixtures. If metadata-only publication performs material
avoidable packing/measurement or repeatedly destroys useful prediction, narrow that
specific invalidation with a failing witness. Do not preemptively add geometry caches,
prune every store, redesign selection reconciliation or revive thumbnail-retention
research. New non-trivial costs or broader fixes require operator discussion.

An extra boundary wait imposed only to reconcile distant ranks is now a regression
to reject, not a cost presumed acceptable. Retain uncertainty without forcing it
onto ordinary scrolling. Actual read failures, an unavailable target, ambiguous
range membership or exhausted scan progress remain real problems to handle honestly.

Canonical readback can return new signed media URLs. Keep resource validity and
security; do not strip signatures or deliberately retain expired URLs for apparent
cache reuse. Observe actual request/decode consequences separately from box stability.

Existing saved campaigns cover core browsing. They do not measure own-write
publication. A later operator-approved comparison should answer one question:
**does one admitted publication during active browsing disrupt useful image progress,
frame time or placement?** Include an indexed Justified case near its threshold and
fixed Grid/Table controls, ordinary no-operation controls, request/work counts and
current-media readiness. Use four repetitions and the existing measurement contracts;
no general re-baseline, live campaign or new harness is authorized here.

## 7. Implementation Sequence

Each unit starts from its controlling implementation and existing tests; line
anchors in this plan may have drifted. A failing regression must fail for the stated reason.
Run the focused check immediately after the first substantive edit. No production
transport is enabled by any of these units.

Unit A is split into three sessions, each with its own operator checkpoint.
Each runs full units after any `src/` change, plus build, browser typecheck and
full local E2E (commands in section 8.6). The operator may run a perf campaign
between sessions. Do not start the next session without operator confirmation.

### A1: Extension Dedup (Authorized)

**Implementation status, 6 November:** A1 is implemented and its automated gates pass:
3,578 unit tests, application build, browser typecheck and all 526 local E2E tests
with retries disabled. Failing-first regressions and consumer negative controls
cover deduplication and continued demand; cold correctness/performance reviews led
to the compound-page and traversal ownership repairs below. No performance campaign
was run; runtime performance qualification remains operator-owned.
A2's comparison and selected buffer route are recorded below.
No editing transport or production publication caller is connected.

The original `extendForward`/`extendBackward` paths concatenated incoming
pages without an ID check. Under an edited sort key (for example `lastModified`)
the same image could appear twice. Write a failing store test, then exclude incoming
duplicates against the retained window while advancing the raw cursor from the
response, preserving survivors' slots, eviction and prepend compensation. Handle
short and all-duplicate pages without a same-cursor loop or a false end. This is
a latent defect independent of editing; no editing code is involved.

Filter accepted images together with their corresponding sort tuples; retain the
unfiltered response separately for raw scan progress. Define how discarded duplicate
bodies/enrichment are treated so a newer overlay cannot accidentally accompany an
older retained body. Recording a duplicate's changed tuple in the ID-keyed cursor
cache must not silently change a surviving window's scan boundary when eviction
later reconstructs it. This is part of dedup correctness, not permission to add the
Unit-B coordinate model or a general publication framework.

**Done when:** failing-first store tests in the existing eviction-cursor/API-mode
suites cover a forward and a backward duplicate and an all-duplicate page, plus a
composed duplicate-at-capacity -> eviction -> reversed-browsing witness. Assert
image/tuple pairing, authoritative boundary cursors and preserved surviving slots,
not merely absence of duplicate IDs. All
suites pass unretried; existing assertions on extension, eviction and prepend
compensation are unchanged. Section 10's shared extension helper is not part of A1.

Implemented continuation uses the existing recovery notice only when a duplicate-only
response advances the raw cursor. The mounted viewport re-evaluates current demand;
pending detail/fullscreen traversal uses its existing temporary subscription and
waits through the existing maintenance cooldown when necessary. Repeated same-target,
same-direction input keeps that pending owner. Cancellation/departure retires its wait.
There is no store-level refill loop, arbitrary extra-page limit, new permanent render
subscription or buffer-copy notification. Empty responses emit no further recovery
and retain the frontier for a later explicit attempt; they do not invent a smaller total.

Accepted hits alone enter tuple retention, enrichment, eviction and prepend accounting.
Discarded resident duplicates keep their prior paired body/overlay/tuple; this is not
an authoritative metadata refresh. Overlap between the backward null and valued reads
keeps the first combined occurrence, with the valued body's tuple and overlay together.
Raw page cursors remain separate from those retained display bodies. Per-page filtering
adds bounded scratch arrays/set and resident-map lookups, not new rank/count/map reads.
These are source/work-count conclusions, not measured frame-time or smoothness claims.

### A2: Publication Route Comparison (Complete: Buffer Selected)

Grid cells read labels, description
and dates from the raw `image` prop; Justified cells skip enrichment; table rows
memoize on `image`. So published content must reach the `image` the cell renders.

| Route | How | Cost/risk |
| --- | --- | --- |
| Buffer replacement | New `results` array with edited bodies at the same indices | Simple, one source of truth; the initial avoidable packing/measurement and velocity reset are corrected in the current A2 trial below; mounted content still does more render-phase work |
| Per-cell publication | Cells select a published body by ID (like `useEnrichedImage`); buffer untouched | May reduce cell/layout work, but needs a coherent body/lifetime contract for other consumers; leaving their displayed content stale is not an accepted performance trade-off |

Prototype both behind a test-only publish call on one existing fixture, in Grid,
Table and Justified while scrolled mid-buffer. Count layout rebuilds, `measure()`
calls and re-rendered cells; assert that no visible box moves. Treat buffer replacement
as the simplicity baseline, not as a predetermined winner or loser.

Compare equivalent correctness: publish the same fixture body/capabilities, open
its resident detail, inspect selected metadata, switch density, and accept a
subsequent valid page publication. Both routes must show the current accepted
content without losing it on those transitions or masking newer data. Retaining old
scan coordinates is distinct from displaying old metadata. State where a per-cell
body lives, which consumers resolve it, and how a newer accepted page supersedes it;
include that integration/state cost rather than comparing a complete route with a
cells-only shortcut. Pre-operation stale-read fencing and observer wiring remain A3.

Report the work counts and correctness results to the operator, who picks one.
Remove the losing prototype; do not ship both. Fewer renders alone cannot select
a route that leaves consumers inconsistent, and operation counts are not measured
latency or smoothness.

**Done when:** both candidates' consumer/lifetime behavior and work counts are
reported, any correctness gap is explicit, and the operator has chosen a route
meeting the shared publication contract. No observer, readback or editor wiring yet.

#### A2 Comparison Checkpoint

**Final decision, 6 November: the operator selected corrected buffer replacement
after the normal-media trial, then explicitly authorized retirement of the other
implementation and temporary tooling. A2 is complete with the validation caveat
below. A3 has not started and requires a separate operator confirmation.**

The retained [publisher](../../src/lib/image-publication.ts) is
`publishImage(image, overlay)`: one resident lookup and same-slot array copy,
unchanged-ratio geometry retention, authoritative enrichment replacement and
deliberate selected-metadata publication. Normal editing and readback remain
disconnected. This is a single-image foundation, not grouped observation or
freshness protection; ordinary later reads and selected caches are not universally
reconciled by this work.

Removed the per-cell body map, listener/React resolver machinery, comparison work
counters and all exact-match source transforms. Removed the interactive trial UI,
its timer, plugin and startup flag. Retained nine publication browser regressions
on untransformed components: three density consumer journeys, three moving-layout
checks, mounted early-demand discrimination, genuine geometry change and real-API
composition. Deleted only the three duplicate per-cell journeys and two tests for
the now-absent trial guards; the API-composition and scrolling tests no longer need
trial controls. The equivalent per-cell unit parameter was also removed. The
comparison and trial observations below remain historical evidence, not executable
alternative routes or a performance qualification.

**Final cleaned-candidate validation:** 3,581 units, application build, browser
typecheck and all 535 local E2E tests pass with retries disabled. A final independent
cleanup review found no blocking regression. Existing WASM-path and bundle-size
warnings remain. No performance campaign, live mutation or Git mutation occurred.
The operator stopped the frontend before cleanup; restart uses the normal
`--use-media-api --canonical-media` command, without the retired trial flag.

**Retained validation caveat:** the first cleaned full run had 533 passes and two
failures. The same-commit resize case received a React dependency module as 200 and
later 404 during fixture optimization: the fixtures were sharing the main Vite
cache. Their caches are now isolated under test output; the resize case and ten
related fixture cases pass together, and the final full run passes. The separate
`clicking a sortable column header changes the primary sort` timeout remains
unexplained: the command reached Credit but did not satisfy the five-second
completion assertion. Bounded source/trace investigation and an unchanged isolated
diagnostic found no demonstrated product defect. The original full-run trace was
lost when the focused runner cleared test output; its failure log and extracted
request observations remained, and the later diagnostic trace was preserved.
The operator explicitly accepted proceeding with this unresolved caveat. No sort
code, assertion or timeout was changed, and the later pass is not claimed to explain
the earlier failure. Ignored evidence is under
`kupua/node_modules/.cache/a2-validation/`: `selected-e2e.txt`,
`cache-isolation.txt`, `sort-diagnostic.txt`, `sort-diagnostic-trace.zip`, and
`selected-isolated-e2e.txt`.

##### Corrected Buffer Trial (Before Final Selection)

**Trial checkpoint, 6 November: corrected buffer replacement was preferred, pending the
operator's normal-browser trial. Per-cell remains retained and inactive in that
trial. Neither route is performance-qualified; A3 has not started.** The operator
is judging whether browsing feels unchanged, not choosing an architecture from
render counts. Recommendation: retain the simpler buffer route if that experience
is acceptable; no measured speed advantage is claimed.

**Correction:** [geometry identity](../../src/lib/result-geometry.ts) is a WeakMap
from result arrays to empty tokens, without image bodies or predecessor references.
Same-slot publication shares a token only when the effective image ratio is
unchanged. Justified packing and velocity continuity use it while keeping their
other geometry, ownership and navigation invalidations. Ordinary page replacements
remain unmarked. No ordinary-page scanner or additional render subscription was
introduced; the comparison's old page-scanning subscriber has been removed.

**Current evidence:** the same comparison corpus now uses local JPEG test cards
(700x576 and 767x561), with a 40px control strip outside result geometry. Both routes
still pass the six consumer journeys. Corrected buffer publication records zero
layout builds and explicit `measure()` calls in all three densities, zero prototype
subscribers and zero cached-page scans. It still executes 78 Grid cell bodies
(39 identities), 98 Table row bodies plus two content bodies (44 registry cells),
and 120 Justified cell bodies (60 identities), including StrictMode repeats. Per-cell
still executes two affected cell/row bodies and uses 40/50/61 mounted subscriptions
for Grid/Table/Justified. Each route reconciles the single selected member once.
These are work counts, not timings; the changed media and viewport mean they are
not pooled with the original comparison below.

The [browser suite](../../e2e/local/grid-mutations.spec.ts) additionally exercises
the actual immediate/armed/reset controls during native wheel browsing in all three
densities, stable document-space packing, no observed programmatic scroll writes
or sampled reverse jumps, and recent actual movement at publication. Its scroll-write
detector has explicit positive controls. A mounted Justified witness admits the next
page with more than the base 50 items remaining across publication; deliberately
losing geometry identity suppresses that admission. These are bounded correctness
witnesses, not every-frame compositor or throughput guarantees. Genuine ratio
change still rebuilds and measures Justified. Hidden-detail and delayed-fullscreen
failures were reproduced before their trial-only dispatch guards were added.
One separate case loads the untransformed app with the real API adapter, nested
Argo responses and local JPEGs, exercising immediate/armed/reset with only declared
reads. Local test cards are not a photographic performance corpus.

**Historical trial and limits:** the now-retired startup controls used the normal
media-api/canonical-media workflow and browser-local metadata only.
There is no mutation, observer, readback or freshness fence. The trial does not
activate per-cell resolution or comparison instrumentation. Normal later reads
can replace a simulation while selection metadata still retains it; the comparison
fixture's explicit newer-page selection publication is not production integration.
Reset discards local simulation state. No universal detail/fullscreen update contract
or A3 guarantee follows from refusing dispatch while those presentations own the view.

Cold correctness and performance/evidence reviews found no blocking issue in the
repaired scope. Final corrected-source gates pass: 3,582 units, application build,
browser typecheck and all 540 local E2E tests with retries disabled. Existing WASM-path
and bundle-size warnings remain. No performance campaign has run.

**Operator trial, 6 November:** the operator reported "This feels great. I can't
feel any difference." A subsequent bounded agent rehearsal in the operator-started
normal app verified the API datasource, matching served source and absence of
comparison instrumentation. One stationary Grid update changed one body, showed
its description/label and preserved nine visible boxes over twelve frames without
network traffic. One armed Justified update arrived during native wheel scrolling:
sampled document-space packing stayed unchanged, with no sampled reverse movement,
unexpected writes or direct-ES requests. All fifteen visible images were loaded at
the end. Temporary listeners/observers were removed, no update was left armed, and
the trial remained available. This supports the simpler route but is not a subtle
smoothness benchmark or independent backend deployment certification. The operator
retains server ownership. Final confirmation and removal were subsequently authorized
as recorded in the final decision above; that does not start A3.

##### Original Comparison (Before the Correction)

The following is historical evidence, not the current implementation or gate status.

**Initial 6 November checkpoint: both prototypes were retained for the operator's choice. Neither was
selected or performance-qualified.** Normal application components do not import
the prototype. The existing [label-editor fixture](../../e2e/shared/label-editor-fixture.tsx)
activates it explicitly; its [Vite plugin](../../e2e/shared/label-editor-plugin.ts)
inserts exact-match consumer hooks and counters only for the comparison server.
The [prototype](../../src/lib/image-publication.ts) has no editor, observer,
readback, freshness-fence or live-transport caller.

**Controlled workload:** the same synthetic 1,200-result indexed corpus, a
200-body resident buffer, one selected mid-buffer target, production Grid/Table/
Justified components and a 1280-by-720 Chromium viewport. Publication changes
description, labels and capabilities, not dimensions or media URLs. Images are
loaded one-pixel data-URL placeholders, intentionally appearing as empty boxes;
this is not photographic delivery/decode evidence.

| Publication work | Buffer replacement | Per-cell publication |
| --- | ---: | ---: |
| Grid cell-body executions / distinct identities | 84 / 42 | 2 / 1 |
| Table row-body executions | 102 | 2 |
| Table content executions / emitted registry cells | 2 / 44 | 2 / 44 |
| Justified cell-body executions / distinct identities | 120 / 60 | 2 / 1 |
| Justified layout-factory executions | 2 | 0 |
| Justified explicit `measure()` calls | 1 | 0 |
| Grid/Table geometry rebuilds or explicit `measure()` calls | 0 | 0 |
| Completed selection reconciliations / selected members traversed | 1 / 1 | 1 / 1 |
| Extra publication subscriptions: Grid / Table / Justified | 0 / 0 / 0 | 43 / 52 / 61 |
| Body notifications to affected consumers | 0 | 2 |
| Shared cached-page checks during the publication | 200 | 0 |

These are development work counts, including React StrictMode's repeated
render-phase executions, not committed-render counts, browser layout counts,
latency, frame time or smoothness measurements. The stationary no-publication
controls recorded none of the counted work. The selected reconciliation must
finish before capture ends. Later detail/fullscreen/density/page/multi-selection
work is captured separately as `A2 lifecycle work` attachments by the
[existing browser suite](../../e2e/local/grid-mutations.spec.ts), not folded into
the single-publication numbers. Packing suboperations, parent renders, selector
evaluations and resource/GC costs are not comprehensively counted.

**Equivalent correctness witnessed for both:** changed rendered description and
labels, withdrawn action admission, unchanged selected membership at publication,
current resident detail and fullscreen entry, density switching, and a subsequent
accepted page restoring newer content and positive capabilities. The newer page
is checked in the rendered result cell, reopened detail and multi-selection panel,
not only store snapshots. Unit witnesses additionally cover existing cached but
unselected metadata and selected offscreen capability replacement. No stale-read
ordering, standalone full-read projection or observer claim follows; those remain A3.

All initially visible outer boxes remained exactly equal on every sampled frame
(at least twelve): Grid 9, Table 19, Justified 16 boxes per route. This does not
prove absence of remounts, media blanking, unsampled movement or active-scroll jank.
The foreground integrated-browser rehearsal independently showed stable Justified
boxes and current detail, Grid, Table and newer-page consumers for both routes.
Its viewport/panel state differed, so its work counts are not pooled with the
controlled automated comparison. Owned subscriptions, wrappers and the local
fixture server were disposed afterward.

**State and lifetime trade-offs:**

- Buffer replacement owns the accepted body in `results`, makes one shallow
  array copy, preserves other bodies/slots and needs no body-resolution cache or
  publication subscriptions. Its changed array still invalidates Justified
  packing/measurement and the existing velocity-continuity reference check.
- Per-cell publication leaves scan bodies/coordinates untouched and stores the
  accepted body in a WeakMap keyed by the original resident object. Cells, detail,
  metadata presentation and fullscreen entry/traversal must resolve that body.
  A distinct accepted page object bypasses the old key; cached selection metadata
  is refreshed separately, so the override cannot mask that page. The old body
  and accepted full body coexist while the original key remains reachable. This
  is not a body-free freshness registry, an explicit capacity bound or a GC proof.
- Both routes scan the resident buffer to find a target, attach its authoritative
  overlay, update only resident or already-retained shared overlays, and use one
  deliberate selection-cache publication/reconciliation action without hydration
  or membership changes. Enrichment upsert still copies its accumulated map.
- The shared fixture page-acceptance subscriber scans changed result arrays to
  refresh existing selection-cache entries, including currently unselected ones.
  That work also occurs on buffer-route publication. It is comparison integration
  code, not an approved new ordinary-browsing service. Selection caching retains
  its existing LRU/lifetime; instrumentation now releases virtualizers on unmount.

**Prerequisites remain explicit:** the per-cell prototype installs extra mounted
subscriptions before its first publication, and the active fixture page listener
adds work to later pages. They must not be copied into the normal no-edit path as
is. The buffer route's velocity invalidation and avoidable Justified work also
remain material risks. No e2e-perf campaign was run, and these counts do not certify
either candidate's performance. Current production browsing does not activate
either prototype. Choosing a route does not itself waive section 6 or authorize A3.

Cold correctness and performance subagents identified the cached-unselected,
fullscreen-entry, instrumentation-lifetime and evidence-boundary issues above.
Failing-first witnesses reproduced the body, selection-cache and fullscreen
defects; the repaired six-case comparison passes. Full final regression gates
also pass: 3,580 unit tests, application build, browser typecheck and all 532 local
E2E tests with retries disabled. The foreground fixture rehearsal is complete.
Build output retains WASM-path and bundle-size warnings; none of these gates
qualifies publication performance. **Stop here for the operator's route choice;
remove only the losing prototype after that decision.**

### A3: Readback, Freshness and Publication (Authorized After A2's Choice)

**Implementation status, 6 November:** A3 is complete. Full units, application
build, browser typecheck, unretried local E2E and the embedded demonstration pass.
The checkpoint below records the retained contract, reviews and the earlier
default-worker unit-timeout caveat. No later unit is authorized.

Implement one simulated label addition with bounded
readback and an owned per-ID publication through the chosen route. Use an existing API-composed fixture with
one resident and one off-screen/standalone witness across representative cases.
Hold an older response, publish the accepted readback, then actually release the old
response and prove it cannot replace the new metadata or restore withdrawn authority.

Use targeted route overrides with real nested Argo metadata envelopes and independent
before/after IDs, totals and sort tuples. The existing generic stand-in drops `q`
and its default count ignores scope; mutating its labels alone cannot prove filter
exit. Capture held old payloads independently so later fixture mutation cannot
silently turn the supposed stale response into fresh data. No duplicate server
parser or new fixture framework is required.

Include subsequent-query protection, unchanged-reference/no-operation controls,
explicit unknown/rejected/deadline outcomes, projection-aware standalone ownership,
and one grouped selection reconciliation. A3 does not close KUP-043: coordinate
reacquisition and unavailable-slot behavior belong to Units B and C.

Include one acknowledged target plus one held command: the observer deadline and
partial publication must settle without waiting for all fake executors. Include
multi-label simulated input refused before any dispatch and unchanged disconnected
comma-separated preparation.

**Done when:** T4, T5 and T15 (section 8.3) pass in existing suites, with T11 as a
no-regression check on cold detail; full gates pass. A short agent-driven embedded
browser demo of one simulated label appearing in Grid, Table and Justified lets
the operator see it; the full section 8.5 rehearsal belongs to Unit D.

#### A3 Checkpoint

The selected buffer route now publishes a verified group with one resident copy,
one grouped enrichment update and one selected-metadata action. Geometry identity,
unchanged references, AI relevance, selection membership and placement signals are
preserved. No per-cell route, body cache, permanent page scanner or rank-repair work
was introduced. Ordinary accepted touched reads reconcile selected metadata through
the same existing owner; duplicate-only pages can withdraw touched authority without
republishing resident bodies or changing raw scan progress.

The injected observer owns one single-label group of at most 200 IDs, up to three
mget attempts at least one second apart, at most one current standalone full read
and a ten-second deadline starting before fake dispatch. Verified peers publish even
with a held command. Late outcomes update receipts without restarting observation;
submitted/unknown same-ID work continues to block conflicting simulation. Exact
returned labels establish observation, never acknowledgement or causation. Required
read failures, deadline, unavailable and superseded evidence remain distinct from
transport outcomes. Multi-label simulation refuses the entire submit and retains
its draft; normal disconnected multi-label preparation remains unchanged.

Read issuance and metadata-projection evidence are attached to returned objects;
the document-lifetime registry retains only bounded facts for 1,000 distinct admitted
IDs. Pre-operation/below-floor bodies and stale hydration omissions cannot undo
accepted state. Contradictory equal/missing clocks remain unresolved; strictly newer
metadata can change the label again. Current denial is accepted even when no body
can be retained. Resource evidence is checked at prepare/confirm, so a captured grant
cannot bypass withdrawal merely because its component did not rerender. Staged old
presentation is marked stale for editing, including explicitly supplied contexts.
Standalone delivery uses the current effect's inert identity token; one guarded full
follow-up preserves original/file metadata, while departure releases surviving owners.

Independent correctness reviews drove regressions and repairs for stale omission,
duplicate-only authority, no-body denial, newer selected bodies, AI ordinals,
standalone departure/re-entry and captured-context admission. The final targeted
correctness review reports no blocker. The independent performance/complexity review
also reports no blocker based on source/work counts, not measured timing. Same-turn
command outcomes are coalesced: a 200-target immediate-outcome control emits four
receipt notifications instead of 403. Existing enrichment, reconciliation and receipt
lifetimes are not claimed to be bounded by the observer's limits.

Completed evidence on the A2 baseline plus the uncommitted A3 implementation:

- T4: captured old API payload actually delivered after publication; later-query,
  evicted-body, selected hydration body/omission and standalone same-ID controls.
- T5/T15: acknowledged/unknown/rejected outcomes, held peer and independent deadline,
  actual late read release, exact labels, admission/resource limits and zero-dispatch
  multi-label refusal. Disconnected controls remain unchanged.
- T11: full original/file metadata, bounded follow-up and departed/re-entered ownership.
- Full units: 3,597 pass with `--maxWorkers=2`, without changed assertions/timeouts.
  The earlier default-worker run had 3,594 passes and one API-bootstrap timeout;
  the unchanged bootstrap suite passes alone. Cause remains unproved, and the later
  passes do not explain it. Evidence: ignored `node_modules/.cache/a3-validation/full-units-first.txt`.
- Final application build and browser typecheck pass. All 536 local E2E tests pass
  with `--retries=0`, including normal, forced-seek, Justified and compiled-hosted
  fixtures. Existing WASM-path and bundle-size build warnings remain. The full browser
  log is retained under ignored `node_modules/.cache/a3-validation/full-e2e-final.txt`.
- API-composed browser journey: one resident plus one off-screen selected target,
  one buffer replacement/revision, retained unrelated references, at most one-pixel
  visible geometry tolerance, released stale page and Grid/Table/Justified consumers.
  A negative control proves undeclared ES traffic is blocked and recorded.
- Embedded demonstration: foreground, local API fixture, 120 resident results and
  local JPEG media; one two-target simulation appeared in all three densities.
  Two observation mget reads, one released stale page, one buffer copy/revision and
  zero observed target-box displacement. A real Justified wheel scroll progressed.
  No unexpected transport occurred. Held work and probes were released, routes and
  the synthetic document discarded, and the owned server stopped. This agent-paced
  demonstration is not a latency, compositor-paint or performance qualification.

The shared test-only launcher is `npm --prefix kupua run demo:readback`, serving
`http://127.0.0.1:3067/__readback` on a strict loopback port. It uses production
components/adapters and the same fixture controls as the automated journey, not
source transforms or a live-backed app. It does not model arbitrary filter exit.

Normal editing remains disconnected. During implementation, the agent performed
no live access/write, backend change, dependency addition, outside-Kupua edit,
Git mutation or performance campaign. The subsequent operator campaign is assessed below.
KUP-043 is not closed; coordinate reacquisition, unavailable slots and later units
remain outside this checkpoint.

##### Operator Performance Checkpoint (6 November 2026)

The operator's `growing teeth after A3` campaign
(`a247639a-987a-4e8a-94ed-a1a51934dacb`, completed 19:29 UTC) is complete:
four repetitions and 78/78 records across rendering, short/long responsiveness and
density. The closest matching baseline is `after amazing bug`
(`b6460be5-db01-467b-bfdc-cd57e6791c06`, completed 5 November, 02:15 UTC).
Both use local media-api, canonical media and matching recorded browser, viewport,
screen, DPR, cutoff and execution settings. The 31 October `compact shell + zoom ladders`
and 2 November `fancu transitions` campaigns supply older matching context. The
3 November direct-ES/proxy campaign is not the matching baseline.

The existing dashboard adapter verifies complete membership, agreeing member source
fingerprints and valid current records. Sixteen legacy rendering records have no
recorded scenario revision and are excluded from formal record-pair comparisons;
62 primary record pairs qualify. The baseline and current source markers are dirty
`13e000e80` and `d04df4cf4`, respectively. Fingerprints do not cover untracked file
contents. The operator confirms the interval includes all editing work; this is not
an isolated A3 comparison. Content and browser/proxy/CDN warmth remain uncontrolled.

Representative recorded medians, not population-tail estimates:

| Observation | 5 November -> 6 November | Interpretation |
| --- | --- | --- |
| Grid forward/backward reference-load frame-p95 | 16.75/16.75 -> 16.70/16.70 ms | Reference progress remains about 101-102 results/s; no loss of useful progress hidden by these frame values |
| Table backward reference-load frame-p95 | 25.1 -> 29.9 ms | A slower observation at essentially unchanged 99.2 results/s; close to 31 October's 29.5 ms, not a demonstrated new causal regression |
| Justified forward reference delivered rate | 92.5 -> 77.8 results/s | Adverse delivered-demand result, not a throughput improvement; lower pending work must not be called a win |
| Justified initial forward calibration | 3033 -> 2609 px/s; 31.5 -> 37.5 initially visible images | Same container dimensions, different initial packing/calibration. The normalized driver estimates from that packing; these are not fixed-input/content-matched arms |
| P14b fast-forward final image arrival | 3557 -> 6185 ms, all 4/4 complete | Slower than the immediate baseline, near 31 October's 6218 ms and above 2 November's 4811 ms. Current saved image-arrival/network clock is 6178 ms, frame-p95 10 ms and metadata lookup count zero |
| P14d rapid-forward final image arrival | 6860 -> 8152 ms, all 4/4 complete | Within older matching 6753-10695 ms observations; still a visible wait, not excused by smooth frames |
| P13c returned-media detail readiness | 2979 -> 1897 ms, all 4/4 complete | Improved in this comparison, but older matching values were 1232-1562 ms; not an isolated editing speedup |
| Home / deep-anchor Back settlement | 1043 / 1338 -> 1261 / 1588 ms | Slower; reported fetch and store-ready clocks also rise. These aggregates do not isolate frontend overhead or establish backend causation |
| Focused sort / click seek settlement | 1234 / 1255 -> 1340 / 1118 ms | Mixed navigation changes rather than a uniform slowdown |
| Constrained stopped-media recovery, Grid / Justified / Table | 1839 / 2614 / 1611 -> 1550 / 1914 / 1372 ms | All 4/4 complete in both campaigns. Justified also did less moving work, so the recovery gain is not equal-work proof |

All nine current density motion groups retain complete refill coverage and 4/4
stopped-media recovery. Stress still exposes substantial pending media, backward
Justified boundary blocking and nonzero sampled displacement already present in
matching history. Those are not newly resolved by this campaign. In particular,
lower Justified delivered demand prevents interpreting its lower waiting/read counts
as a free improvement, even though capture and workload-contract checks pass.

**Disposition:** retain this as the post-editing ordinary-browsing checkpoint, with
Justified calibration/delivered demand, slower forward image arrival and navigation
latency as explicit watches. The evidence does not establish a broad browsing collapse
or justify a speculative runtime fix, but it is not a blanket no-regression claim.
The campaign does not dispatch a simulated edit or exercise active touched-ID floors:
publication-under-scroll performance remains distinct from the local correctness,
work-count and embedded demonstration evidence above. No additional campaign was run
by the agent and no simplification target is selected from these aggregates alone.

Canonical evidence is in the [campaign manifest](../../e2e-perf/results/campaign-log.json),
[rendering history](../../e2e-perf/results/audit-log.json),
[responsiveness history](../../e2e-perf/results/perceived-log.json) and
[density history](../../e2e-perf/results/density-log.json), under the two campaign IDs above.

### Feasibility Spike Before Unit B

A short, throwaway investigation answering one question: can the existing search
store keep "where the user is scrolling" (display slots, scan frontier) separate from
"exact server rank" without a second enumeration engine, unbounded state or extra
reads per page? Deliver a concrete yes with the minimal change set, or a
counterexample with alternatives. A failed spike does not prevent use of the
completed disconnected Unit-A prototype; further implementation still needs its
own operator authorization. Section 5.6's Option A retains unavailable slots but
does not by itself solve stale maps, range endpoints or history coordinates.

Do not declare Step 4 complete or step 5 unblocked on that fallback. Any reduced
Step-4 acceptance scope requires an explicit operator decision naming the omitted
contracts and retained restrictions; otherwise section 9's full completion gate
stands. Existing deliberate navigation remains usable, not a substitute for the
unproved continuation contract.

#### Spike Checkpoint (7 November 2026)

**YES: bounded continuation is feasible within the existing owners.** The executable
prototype preserves ordinary browsing without a second enumeration engine, a global
visited-ID set, or a rank/count/map/rebase request merely because distant ordering
changed. Its indexed refill keeps parallel loading and handles bounded incoming
overlap. This is feasibility evidence and a proposed Unit B change set, not a shipped
coordinate-trust implementation or a claim that all Unit B obligations are complete.

The operator authorized the spike and this alternative investigation, not Unit B.
Starting HEAD remained `26dcbedea3`, after A1 `69135d79e`, A2 `d04df4cf4` and A3
`feecf097f`. No reset, staging, commit or push occurred. All runtime/test prototypes
were removed after validation. The separate simplification session and Section 10
are not prerequisites.

**Corrections to the initial assessment:** the original nine-million witness removed
one image located 650,000 positions above the viewport, not 650,000 images. The
separate 400-image move fixture had incompatible metadata/root timestamps and did
not establish a normal label-edit blocker. That finding is withdrawn following
[producer-provenance review](03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-09-p23-query-mapping-s1.md#f4-identity-and-edited-date-provenance-are-now-joined).
Likewise, two manually supplied viewport reports did not prove an automatic
empty-page loop; a later user action is already allowed to try again. The mounted
recovery test below refutes that blocker. Earlier diagnostic artifacts are retained
locally as superseded evidence, not acceptance criteria.

##### Executed Proof

| Witness | Outcome and scope |
| --- | --- |
| Nine million logical results; 0, 1 or 332 distant filter exits | All three pass through the real API mapper, search store, simulated operation and mounted `useDataWindow`. A 1,000-image buffer starts at 4,000,000; affected IDs start 650,000 places above it. Predictive loading is already in flight before dispatch. The 332 targets use sequential 200/132 groups within the existing admission bound. |
| Ordinary continuation and no-operation control | Every arm completes the held page, a second forward page with eviction, then reverse browsing using exactly three page reads. Resident IDs, surviving references/slots and raw cursors are checked. Current ranks differ from retained slots by 0/1/332. Generated bodies total 1,600/1,601/1,932, not millions. Edit readback adds zero/one/two mgets, not navigation-repair reads. |
| Detector and exact-action contrast | The earlier dispatch-time abort mutant fails the useful-read assertion. Separately, identity restoration resolves a captured image at its current rank with one rank and three page reads, no count. Neither result certifies all range/history paths. |
| Indexed boundary, real API transport and store publication | Eight cases cover large ties, one delayed label projection, projection between response snapshots in both sort directions, valued-to-null, a near-null short page, all-null results and prefix IDs. Both page requests start while held; normal results contain 100 backward plus 200 forward hits with no rank/profile/count/map request. |
| Cross-response overlap and A3 | Failing-first races initially duplicate an image or leave a rejected duplicate slot. The bounded merge publishes 299 unique images without topping up. The current label and matching retained tuple survive; a later-issued permission denial remains effective even with older metadata. Admission reuses A3, not another timestamp policy. |
| Short page, bridge, eviction and reversal | A near-null response legitimately has 40 backward plus 200 forward hits. Later reverse demand uses the existing two-read valued/null bridge, without a compulsory initial top-up. The delayed-label case then extends four pages, evicts at 1,000 residents and reverses; surviving positions remain unchanged. |
| Empty completion through mounted scroll effects | Each direction issues one empty read, then remains quiescent for five seconds and subsequent frames. Scrolling away and back permits one new attempt. No new timer, permanent end lock, fabricated smaller total or retry engine is needed to obtain that behavior. |
| Browser compatibility | The frozen prototype passes all 536 local E2E tests with retries disabled, including normal, forced-seek, Justified and existing API/compiled-hosted fixtures. This is regression evidence, not a new nine-million active-publication browser campaign. |

The delayed cases model a known dispatched operation whose projection appears after
an older map is captured; later metadata timestamps and root ordering are consistent.
They do not rely on an unnoticed external change as the sole intervention. The map
fixture retains only 30,000 lightweight keys, within the existing indexed regime,
and generates bounded page bodies. Its ordering oracle compares complete UTF-8
tuples independently of the store's join. A3 still owns timer/deadline semantics.

##### Proven Continuation Mechanism

Ordinary extension already separates raw response progress from accepted display
additions. Keep that path and its useful lookahead. In the indexed-map path, use one
old predecessor tuple `P` as a hint, with complementary query bounds:

- Forward reads strictly after `P`, unchanged.
- Backward reads strictly before a copy of `P` whose final ascending ID has a NUL
  appended. Under the existing keyword byte ordering this includes `P` and excludes
  every tuple after it. Both requests remain parallel.

This is not the earlier empty-ID cut, which can jump to the beginning of a large
tie. It also does not require NUL-free IDs: an actual `P + NUL` ID belongs to the
forward page rather than being omitted from both sides. No new backend snapshot,
inclusive-range endpoint or stricter image-ID guarantee is assumed.

Different response snapshots can still return an image twice. The prototype merges
only their incoming candidates: reuse `acceptImageRead` for touched duplicates,
keep the selected body with its response tuple, preserve the selected untouched
overlay, and independently admit touched negative authority through A3. Capture
both raw scan frontiers before filtering; do not reconstruct them from refreshed
display fields. Derive backward placement from accepted hits, not the raw count.
Do not issue another read merely to fill 200 or 300 accepted slots.

PIT-less reads can also omit an image that crosses between both snapshots. The merge
cannot recover a document neither response contains. This preserves the existing
current-at-read contract, not exact complete enumeration during arbitrary changes.
It proves neither deletion nor mutation settlement; an identity-dependent action
must resolve its requested identity. No stronger backend guarantee is selected.

##### Minimal Proposed Unit B

These changes require separate implementation authorization:

| Existing owner | Proposed bounded responsibility |
| --- | --- |
| [Search store](../../src/stores/search-store.ts) and operation/publication admission | Add constant-size ordering revision/uncertainty at admitted dispatch and newly accepted canonical projection. Qualify map/profile/rank/refill completions under their existing action owners; an obsolete completion must not publish exact authority or clear successor state. Preserve captured destinations and useful cursor work; do not call `abortExtends()` globally. Observation/deadline does not settle ordering. |
| Search store's indexed refill | Apply the proven complementary boundary and incoming merge. Retain map entries as acquisition hints and existing offsets/extent as display coordinates, not current server ranks. Keep the current placement mathematics: merely setting `exactOffset = false` would choose a different placement path. Publish data, extent and placement coherently when an actual action reacquires them. |
| [Response tuple retention](../../src/lib/image-offset-cache.ts) | Preserve response-owned tuples across eviction and reversal independently of body refresh. Reuse the bounded cache where its lifetime suffices; prove reachable retention/miss behavior before adding storage. Do not clear local positions or permanently exclude touched IDs from legitimate reverse re-entry. |
| [Data window](../../src/hooks/useDataWindow.ts), [scroll effects](../../src/hooks/useScrollEffects.ts) and [traversal](../../src/hooks/useImageTraversal.ts) | Keep current demand, geometry and placement ownership. Overlapping/near-buffer demand uses extension; valid outside-buffer maintenance uses refill. Empty completion remains quiescent, with a later action allowed to try again. Add only boundary-scoped completion facts if needed to settle terminal traversal/presentation, not indefinite polling or a permanent frozen end. |
| [Range selection](../../src/hooks/useRangeSelection.ts) | Validate both captured identities before the wholly resident displayed-order fast path. For an uncertain off-window range, resolve both endpoints through the current query and then walk their returned tuples under the existing range owner. Mget alone is not membership evidence. Absence/failure changes no selection. |
| [History/identity restoration](../../src/lib/search-continuity.ts) and existing seek callers | Keep destination identity, placement ratio and numeric/fraction intent distinct. Reuse existing owned identity/rank reads when needed; a missing-cursor/error numeric fallback cannot certify that the requested identity was restored. Preserve Home/ticker policies and newer-input ownership. |

Map-unavailable navigation remains its existing path. The earlier local control used
two page calls, one rank and one estimate; it is not permission to clear a stale map
and impose that cost merely because an edit occurred. The display regime stays based
on the admitted extent, not map arrival or an independently changed count. Small-set
truth and unavailable-slot policy remain Unit C, not a solution to stale authority.

##### Cost And Remaining Proof

The prototype adds one copied boundary tuple, a backward-ID map of at most 100
entries and at most 200 forward candidate checks per indexed refill. Duplicate-only
scratch is page-bounded; no additional image bodies, persistent visited IDs, render
subscription or frame-time scan is introduced. It keeps the same parallel 100/200
request budget and the 1,000-image resident cap. Near-null bridging is existing useful
demand, not an edit tax. Exact remote actions may require bounded endpoint reads;
ordinary continuation does not inherit that work.

The proposed revision is constant-size. Existing tuple retention is bounded at 2,000
entries plus an anchor and A3 facts at 1,000 touched IDs. Existing A3 result freshness
scans, enrichment accumulation, selection reconciliation and receipts remain separate
costs: neither this spike nor those bounds certify the whole heap or measured speed.

Unit B still must prove held exact acquisitions across dispatch/publication and
expired observation, both tier thresholds, newer input during in-flight refill,
terminal traversal/placeholder presentation, remote endpoint exit, invalid history
hints and the complete view-placement composition. These are implementation obligations,
not evidence that a second engine or rank-first ordinary continuation is necessary.
The spike does not install their guards or declare them complete.

Independent read-only correctness and performance/complexity challenges supported the
bounded design, identified the cross-response duplicate race, and led to its
failing-first repair. Final correctness review found no candidate blocker. Concerns
about direct manual overlapping refills were qualified against the actual caller:
near-buffer reports use extends and cancel queued refills; geometry-invalid reports
cannot admit maintenance. In-flight newer-input protection remains a named Unit B
proof. Existing no-rank/map-survival, A1 pairing, A3 freshness, eviction/re-admission,
Home/ticker/history and normal Justified assertions were not weakened.

##### Validation And Cleanup

The final prototype passes 3,604 unit tests, application build, browser typecheck and
all 536 local E2E tests without retries. One earlier full-unit failure exposed the
mock's ID-lookup shortcut for non-document cursors; a temporary tuple-comparison
fallback corrected the fixture, retaining the original enrichment assertion. That
mock adaptation is archived with the prototype, not shipped as unrelated cleanup.

All five modified source/test files were restored. The original paging suites pass
216 tests; the restored full suite passes 3,591. Build and browser typecheck pass
again, and normal build output was regenerated. Existing WASM-path and bundle-size
warnings remain. The full E2E result above was obtained with the prototype present;
no second E2E run is claimed after exact source restoration.

Reproducible local evidence is under the ignored
`node_modules/.cache/unit-b-spike-2026-11-07/follow-up/`: `prototype.patch`, final
prototype unit/build/type logs, `prototype-e2e.txt`, and restored-source logs.
All commands used repo-root `npm --prefix kupua run ...`, foreground pipefail and
live tee. Held responses/observers were released and hooks unmounted; browser test
contexts and runner-owned servers completed. Only this checkpoint remains as a
tracked change, with the worklog reset. No planning-only changelog entry was added.

No shared live-backed browser, live mutation, backend/dependency/outside-Kupua edit,
Git mutation or performance campaign was used. The A3 campaign remains ordinary-
browsing evidence with its mixed results and Justified calibration limits, not active
edit-publication measurement or isolated A3 causation. This spike does not certify
production frame times, backend scale or deployed transport policy. Normal editing
remains disconnected. Unit B needs an operator decision; Units C-D, Step-4 completion
and step-5/live editing remain outside this authorization.

### Unit B: Stable Continuation and Coordinate Trust (Ready for Operator Checkpoint)

Start with the section-8 distant-change discriminator, then add the
smallest coordinate-trust/scan-frontier contract to existing store/navigation owners.
Cover a simulated addition that exits a negative-label filter and one that changes
`lastModified` order. Prove that retained presentation does not switch tiers at the
1,000/65,000 boundaries and that a fresh action publishes total/window/placement
together. Fence held map/profile/rank/seek work and preserve newer input ownership.

Implement the proven bounded continuation policy, current endpoint resolution for
remote ranges, and invalid-history-hint handling. Keep existing Home/ticker tests
unchanged. Stop for a decision if the implementation requires a second enumeration,
new scroll lifecycle, materially more navigation requests or weaker preservation.

Hold the user stationary with resident neighbours near an edge, then publish the
edit: predictive traversal/range reports must not rebase it. Separately expire an
unconfirmed observer and let the synthetic projection change far above the window.
Continue scrolling through forward eviction and reverse prepend: current identities
and boxes must survive with ordinary cursor reads, not repeated rank/count requests.
Then exercise an exact off-window range or identity restoration separately: those
must not promote stale display positions to current server rank.

#### Unit B Checkpoint

**7 November 2026: candidate implemented after explicit fresh-agent confirmation.** Retained
display positions, response-owned scan frontiers and rank authority now have separate
roles in existing owners. No ordinary editing caller or live transport is connected.
Independent correctness and performance re-reviews cleared their earlier findings.
A subsequent retained-end check found the admission gap below; the operator confirmed
that Next must discover new matches, and its bounded repair is now implemented.
Implementation and whole-candidate validation are complete for this checkpoint.
No later unit is authorized.

<a id="open-retained-end-blocker"></a>

##### Retained-End Resolution

The failing zero-read witness was extended to both 1,000 and 65,000 boundaries.
Next and viewport demand now reach the retained raw frontier with the frozen upload
cutoff. Actual accepted rows raise one display high-water mark; admitted total/tier
stay unchanged. Reversal, queued browsing and refills retain the new extent without
count/rank/map repair. Pinned wheel demand reports through the existing owner.
An empty response stays quiescent, while a later explicit attempt or viewport
excursion remains eligible. Focused page keys now share the arrow terminal guard.

Justified preserves former terminal packing boundaries in its existing bounded
dimension snapshot, including density remounts. The real browser witnesses require
actual rendered images, not only position-map entries: one exercises Next at 1,000,
the other wheel continuation and a Justified/Table/Grid/Justified round trip at
65,000. Retained boxes stay within one pixel, with one data page and at most one
empty lookahead page before the separate density journey, and no repair reads.

Browser proof also exposed an A3 re-entry gap: after off-buffer observation, a later
identical equal-version page had no retained body to compare and became a blank slot.
Existing touched-ID facts now retain the exact serialized comparison projection
(metadata, userMetadata, usageRights). Matching re-entry does not advance ordering;
conflicting equal-version and below-floor reads remain rejected, independently of
permission withdrawal. This is bounded by 1,000 identities, not constant bytes, and
retains comparison metadata rather than complete images or an alternative read path.

Dispatch and newly accepted metadata projection advance one revision in the existing
touched-ID facts. Matching labels, command acknowledgement and observer expiry never
settle ordering. Held exact acquisitions are qualified under their existing owners;
useful cursor reads and prefetch continue. Stale maps remain hints, including a map
delivered after dispatch, rather than being cleared into the more expensive no-map path.
Uncertain deliberate ordinal/edge actions publish fresh bounds, data and placement
together; scrubber fractions and queued indexed browsing retain display intent.

Indexed refill uses the proven `P` / final-ID-`P + NUL` partition with parallel 100/200
reads. Centred identity loading shares incoming-only overlap admission. A3 chooses
bodies with their response tuples and independently admits negative authority; raw
frontiers precede filtering and no read tops up omitted duplicates. A moving target
in a neighbour response is reconciled before exact acquisition completes. A bounded
reacquisition can retain its accepted target locally; no persistent body cache is added.

Resident ranges verify both displayed endpoint identities. Uncertain remote ranges
resolve both endpoints under the current query and walk that same upload-admission
scope. Missing endpoints or required-read failure changes no selection. History keeps
destination identity and placement despite invalid numeric hints; genuine absence
uses destination top/no-focus. Failed cursor restoration no longer silently seeks to
its cached number, and uncertain focus-position failure keeps the bookmark with an error.
Home logo, Home/End keys, ticker, query/sort and history remain distinct policies.

Two bounded terminal facts settle empty-frontier traversal without reviving old demand
or cancelling a new explicit attempt. Empty completion stays quiescent; a viewport
excursion can try again. Indexed terminal slots retain their dimensions and packing
without loading skeletons; a wholly terminal viewport shows Start/End of results.
**Physical indexed space and the estimated count remain.** Clipping that space or
repacking survivors is not implemented. This does not infer deletion or implement
Unit C's unavailable-image policy.

**Final validation:** 109 unit files / 3,619 tests, application build, browser
typecheck and all 545 local E2E tests pass, with retries disabled for E2E.
The first full browser run found two stale tooltip text-node selectors; only their
selector changed, preserving exact text, geometry, ownership and negative-control
assertions. The full rerun is green. Existing WASM-path and bundle-size build
warnings remain. Failing-first witnesses cover incoming overlap, held ranks/profiles,
map hint qualification, both tier thresholds, newer input during refill, resident and
remote endpoints, actual observer expiry followed by projection, and terminal demand.
Normal Home/ticker/Justified and direct-ES/API/compiled-hosted compatibility gates pass.
The history browser journey restores one identity within one pixel despite an invalid
hint, then verifies missing-anchor top/no-focus. Superseded numeric-fallback assertions
were replaced with explicit failure/ownership assertions; redundant recovery-outcome
variants were removed, not replaced with weaker identity checks.

The isolated browser control and distant-edit arms preserve active lookahead, forward
eviction and reversal with three browsing page reads and a 1,000-image buffer. The
interruption control is rejected by the detector. A separate foreground embedded
capture recorded 170 frames and 1,808 retained-box comparisons with no displacement,
no rank/count/map repair read and no hidden interval. An earlier hidden capture expired
and is excluded. Grid/Table/Justified round-trip and invalid-hint Back restoration had
zero vertical drift; an unknown transport outcome remained unknown after observation.
Terminal presentation and unchanged Home behavior were shown. Holds, probes, listeners,
routes and owned server were cleaned up; no live-backed browser was used.

The final retained-end foreground rehearsal displayed the newly matching image via
Next at 1,000 without changing count or mode. At 65,000, the old Justified tail box
was identical before/after discovery, and the new image returned to the identical
box after a Justified/Table/Grid/Justified round trip. A 412px coarse-pointer detail
check retained usable media and position text. These are functional geometry checks,
not frame-time measurements. Owned probes, held work and fixture servers are stopped.

**Costs and limits:** the join uses page-bounded scratch (at most 300 indexed candidates,
201 centred candidates); tuple retention remains 2,000 entries plus an anchor and
touched facts remain capped at 1,000 IDs. Their exact comparison projections retain
variable-sized metadata and require admission-time serialization; the cap is not a
whole-heap or byte bound. Two terminal records, one revision and one display high-water
mark add no enumeration engine or per-cell scan. Justified terminal partitions remain
within current buffer/boundary blocks; indexed descriptors still scale with display
extent, which may grow beyond the original tier threshold.
Exact actions can add a count, a two-endpoint query, or identity/rank/neighbour reads;
each identity acquisition permits one ordering reacquisition, with existing neighbour
fallback separately bounded. Existing enrichment/selection/receipt lifetimes are not
claimed to be bounded by those figures. PIT-less snapshots can still omit a moving
image from both halves. These are correctness/work-count observations, not measured
smoothness or backend-scale qualification. A3's ordinary-browsing campaign and its
mixed observations are not an isolated A3 verdict or active-publication measurement.

First independent correctness/performance challenges found moving-target overlap,
range cutoff mismatch and old terminal completion cancelling new traversal. Each was
reproduced and repaired in existing suites. Ignored evidence is under
`node_modules/.cache/unit-b-validation/`; the reusable launcher is
`npm --prefix kupua run demo:readback -- --continuation` on strict loopback port 3067.
Final correctness and performance reviews cleared the repaired candidate. The
retained-end review also caught focused page keys entering terminal placeholders;
both directions were reproduced and repaired. Cross-density terminal packing had
failing-first component and browser witnesses and a clear follow-up review. Exact
projection retention and growing indexed extent retain the cost qualifications above.

Stop here at the Unit B operator checkpoint. Units C-D, Step-4 completion and
step-5 or live-edit activation remain unauthorized; section 10 is not a prerequisite.

The final performance challenge also caught missing cancellation on exact-bound
counts. The navigation signal now reaches both existing client count transports,
with a held-count/newer-destination regression. This does not certify upstream
backend cancellation. One unused speculative rank may remain in flight until its
read settles or its existing owner is cancelled. Range direction-swap fallback can
produce three walk invocations across two ordering attempts; it is not an unbounded
retry. These remaining bounded costs are not ordinary-continuation repair work.

### Unit C: Unavailable Slots and Cross-View Acceptance (Ready for Operator Checkpoint)

Operator authorized Unit C on 7 November 2026 after fresh-agent confirmation of
committed baseline `4bbfd2796aff9d12693da9f4f8479d853c256b32`. Unit D remains unauthorized.

Add the minimum explicit unavailable/deleted publication state needed by synthetic
fixtures, with stable boxes and disabled actions. Cover surviving/missing anchors,
resident traversal, off-window range refusal, AI relevance preservation, cold detail
and a density change during pending reacquisition. No delete command is implemented.

The geometry assertion for metadata-only publication covers every retained visible
box in Grid, Table and Justified. Rebase asserts its elected destination/anchor under
the selected action policy. Existing normal Justified repacking assertions remain
intact rather than being reclassified as new Step-4 failures.

#### Unit C Checkpoint

**7 November 2026: implemented and validated within the confirmed Unit C-only assignment.**
Lifecycle publication uses explicit unavailable/deleted bodies through the existing
result, enrichment, selection and standalone owners. Bodies retain identity, dimensions
and AI relevance without inaccessible media/metadata. Availability shares the existing
1,000-ID facts; old reads/grants cannot undo it. A later admitted positive read can recover
unavailable content only if its metadata passes the floor. Ordinary reads cannot refute
confirmed deletion. Failed reads, mget omissions and singleton 404 remain distinct from
lifecycle evidence. Normal editing stays disconnected; no delete/restore command or
new live caller was introduced.

T3 failed first because deletion left five cells. The mounted container now proves
complete residency and actual non-scrollable fit before local removal/count adjustment.
Surviving focus stays; removed focus clears. A stronger zero-read witness caught an
automatic continuation after lifecycle invalidation; the existing terminal boundary
now settles stationary demand without suppressing later explicit traversal. Scrollable
sets retain slots under Option A. Grid, Table and Justified withhold media/actions and
preserve dimensions. Detail may remain open as terminal content; traversal and keyboard
focus skip terminal slots. Selected IDs and captured operation targets remain, range
interiors report unavailable accounting, unavailable endpoints refuse unchanged, and
operations never execute an eligible subset. Cold-detail missing/failed reacquisition
of an already-unavailable target settles explicitly rather than waiting forever.

**Final gates:** 109 unit files / 3,633 tests, application build, browser typecheck and
all 550 local E2E tests passed sequentially, with browser retries disabled. Existing
WASM-path and bundle-size warnings remain. The first build caught a nullable terminal
cursor; its guard was repaired before the final full sequence. Pre-commit review also
reproduced metadata-only compaction after viewport growth; incoming explicit deletion
evidence is now required, and the full sequence passed again after that repair. Existing ordinary buffer
coherence, metadata-only all-visible-box checks, AI ordinals, freshness conflicts,
Home/ticker/history, useful lookahead and normal Justified repacking assertions remain.
New coverage extends existing suites only, including five browser journeys and a
controlled four-pixel displacement detector. Evidence and failing-first traces are in
`node_modules/.cache/unit-c-validation/` (`full-units.txt`, `build.txt`,
`browser-types.txt`, `full-e2e.txt` and the named failure directories).

**Foreground demonstration:** isolated loopback API fixture, real loaded local media
and foreground clicks/wheel/density controls. Five images fit; deletion produced four
with surviving focus, zero additional reads and no unexpected traffic. In scrollable
Justified, 300 retained-box comparisons across twelve frames had zero displacement;
the unavailable slot had no media/loading placeholder and total stayed 120. Table
retained its terminal row. Open detail changed to deleted without media/crop actions;
Previous skipped an unavailable neighbour. A 412px coarse-pointer compact shell showed
unavailable detail within the viewport. A declared optional date-profile 503 left
detail usable. The initial hidden attempt and an earlier undeclared-profile capture
are excluded; the latter prompted an explicit synthetic failure handler, not histogram
machinery. Automated proof covers the held-read/density race and cold-detail paths;
the foreground rehearsal does not claim every such interleaving or frame-time evidence.

**Costs and limits:** lifecycle work is event-driven, with bounded resident scans and
one grouped publication, not a new body cache, polling loop, scrolling engine or global
compaction. Fit checking reads the registered container and rendered IDs only when
deletion publication may compact a complete set. Availability adds constant-size facts
per touched ID within the shared cap; existing exact comparison metadata remains
variable-sized, not byte-bounded. Selection reconciliation keeps its existing cost.
No performance campaign or live-system work was performed. The fixture's optional
profile failure does not certify successful histogram delivery.

**Contextual direction agreed; workflow deferred:** section 5.6 now distinguishes
deliberate-action removal, background stability and harmless offscreen cleanup rather
than asking for one universal A/B/C choice. Unit C's conservative plumbing is unchanged;
the later Delete interaction walkthrough and B/C-type implementation remain separately
scoped. Uncertain filter membership still retains fresh content without local CQL
evaluation or automatic rerun; the optional small-set rerun is a separate decision.
Unit D's seeded integrated programme,
complete observer/topology rehearsal and independent complete-candidate reviews are
deferred, not claimed by these passing compatibility gates. Step 4 is not declared
complete and live editing remains disabled.

**Cleanup:** held fixture work and browser probes/routes were released; the synthetic
page returned to blank and the owned fixture server stopped. Ports 3000/3030/3040/3067
were clear after validation. The unrelated live-backed tab and pre-existing external
changes were untouched. No Git mutations occurred during implementation/validation.
The operator subsequently requested a Kupua-only Unit C commit and a fresh-agent
Unit D handoff, including the documented contextual deletion clarification. The session
worklog is reset to its scaffold before staging. No push or Unit D execution follows
from this closeout; the next agent must confirm its Unit D-only assignment.

### Unit D: Integrated Gates and Closeout (Accepted)

Operator explicitly confirmed this Unit D-only assignment on 7 November 2026,
after fresh-agent review of baseline `49340bf7b1c2179e82fa4c8adf5b2afbfcd5ab37`.
Execution stops at the Unit D operator checkpoint; no later editing step, live
activation, performance campaign or Git mutation is authorized.

Validate the implemented plumbing, not the future Delete-button workflow. Section 5.6's
contextual direction does not authorize C-type command compaction, B-type offscreen
cleanup, external-change delivery or the deferred paired interaction walkthrough here.

Use the production editor and injected observer through existing local API and
compiled-hosted fixtures. Assert zero real mutations, exact captured IDs, request
budgets, meaningful outcomes and no direct-ES rescue path. Direct ES stays read-only
and passes its existing compatibility suite.

Run the required full units, application build, browser typecheck and full local
E2E after the implementation, including normal/forced-seek/Justified projects.
Complete the mandatory agent-driven embedded-browser rehearsal in section 8.5 so
the operator can observe risky transitions. Automated green results alone do not
close this gate; embedded observation alone does not replace the suites.
Independent complete-candidate correctness and performance/complexity review follows
integration. A passing fixture is not a deployed-policy or performance certificate.
Record any operator-run measurement and its actual limits separately.

Update current architecture/API/selection guides and KUP-043 only for implemented,
validated behavior; append the code-change changelog and any deliberate deviations
then. No planning-only changelog entry. Step 5 remains separately authorized, including
removal preparation, server-policy and target/session/action permission.

#### Unit D Evidence and Review

**7 November: integration, reviews, foreground rehearsal and final full gates complete.** Baseline
`49340bf7` supplied 109 unit files / 3,633 tests and 550 E2E passes. Those saved logs
were inspected, not rerun for orientation. Historical failure directories remain evidence.

| Requirement | Reused evidence and Unit D addition |
| --- | --- |
| T1/T2/T6-T8 continuation, tiers, nulls and exact targeting | Final B checkpoint and existing API-mode, cursor, map, range and special-sort suites; original coherent-buffer and normal Justified assertions unchanged. T1 foreground control/edit each used three browsing pages, zero rank/count/map repair reads and preserved survivors. |
| T3/T10/T12 lifecycle, selections and finite AI | Final C checkpoint and existing lifecycle/detail/range/AI suites. Foreground five-to-four deletion retained surviving focus with no reads; uncertain membership retained metadata. No Delete workflow or offscreen compactor added. |
| T4/T5/T11/T14/T15 freshness, outcomes and bounds | A3/C suites retained. Unit D added failing-first authority-withdrawal and empty cold-detail regressions. Existing local editor/API and compiled-hosted fixtures now check exact fake-command arguments, selected publication, two captured-ID mget reads and truthful partial/unknown outcomes. |
| T9/T13 presentation ownership and history | Existing pending-density/history/Home/ticker suites retained. Four fixed seeds (17, 43, 101, 211), 24 valid actions each, mix wheel/edge keys, selection, density, simulation, actual stale release and native detail Back. Independent modeled identities/positions, reference/geometry ownership, per-publication request budgets and captured receipts are asserted. |
| Sort inventory | Registry/builders supply uploadTime, taken, lastModified, credit, source, imageType, category, mimeType, width, height, uploadedBy, usagesDateAdded, configured aliases and dateAddedToCollection. Existing sort-builders wire-contract cases enumerate both directions and reversal; special-date/max/null and API tuple cases supply distinct algorithms. No sort/layout/topology Cartesian expansion. |

The named End/Home reduction proves that a shallow End acquisition can validly hold
the tail window instead of permanent full residency. Earlier seed failures were driver
errors (pointer-inert image target, selection-mutating setup click, edge-read budget,
full-residency assumption, virtualized ordinal locator), not product regressions. Their
traces are retained under ignored `node_modules/.cache/unit-d-validation/`. No existing
geometry tolerance, ownership check or ordinary-buffer assertion was weakened.

Independent correctness review found two defects and both were reproduced before repair:
nonmatching readback ignored current authority withdrawal; failed cold detail with no
published body stayed unsettled behind an operation fence. The repairs use existing
authority and requested-ID owners, with no extra read, retry or cache. The full owning
operation/detail suites pass. Review gaps in fake-command capture, consumer publication,
observer-local counters and edge input were closed. Correctness and performance/complexity
follow-up reviews report no remaining blocker in those inspected repairs; neither is
whole-system certification or measured performance evidence.

**Foreground rehearsal:** isolated `demo:readback -- --continuation`, ApiDataSource,
current served repairs, local JPEG media and self-only CSP were verified before input.
T1 control/edit captured 144/148 visible frames and 1,500/1,544 retained-box comparisons,
with zero displacement; the interrupted-lookahead control failed its detector. Indexed
T4/T9 delivered the old response after observation and kept the unknown outcome; Table
recorded 288 comparisons over twelve frames without movement, with a four-pixel negative
control. Grid, Table and Justified were exercised. A separate pending End read, density
change, publication and newer Home ended at the Table top. Cold detail used one full
follow-up with usable local media. At 412px, actual coarse-pointer emulation selected the
compact shell without overflow; native touch Home cleared focus/selection at the top.
The compact shell's Justified presentation is not a desktop Grid failure.

Invalid setup attempts (unsupported embedded request-context API, wheel pointer over
the fixture strip, ambiguous Home locator and a desktop-layout assertion in compact mode)
are excluded. No hidden capture or failsafe-released capture counts as proof. The fixture's
declared optional date-profile 503 remains a failure path, not successful histogram coverage.
Input/holds/probes were released, isolation remained until unmount, the owned page closed
and server stopped. The live-backed tab was untouched.

**Costs and exclusions:** authority acceptance adds constant-time existing-fact work per
returned captured target; detail settlement adds no work. Observer limits, variable-sized
comparison metadata, enrichment copying, selection reconciliation and growing indexed
extent retain A-C's qualifications. The extra-read negative control changes the counter
fed to the assertion, not transport. No live mutations, backend/safeguard/dependency changes,
performance campaigns or Git mutations occurred during implementation/validation. Functional browser proof is not compositor,
backend-scale, deployed-policy or frame-time certification. Step-17 deletion interaction,
optional small-set query rerun and all later activation decisions remain outside this
acceptance.

**Final gates:** 109 unit files / 3,635 tests, application build, browser typecheck and
all 555 local E2E tests passed sequentially with normal runner settings and browser
retries disabled. The full E2E run completed in 8.3 minutes with files frozen, covering
normal, forced-seek, resident/indexed/seek Justified and compiled-hosted fixtures.
No acceptance retries, skipped cases or widened timeouts/tolerances were used. Existing
WASM-path and bundle-size build warnings remain. Logs are retained under ignored
`node_modules/.cache/unit-d-validation/{full-units,build,browser-types,full-e2e}.txt`.
New coverage consists of two focused unit regressions, four bounded browser sequences
and one named tail-window control; existing topology cases were amended rather than
duplicated. Earlier A-C regressions and ordinary coherence/repacking checks remain intact.

**Operator acceptance, 7 November:** Unit D and the Step-4 simulated foundation are
accepted, with no demonstrated in-scope blocker remaining. KUP-043 is closed for that
tested contract, not as deployed-write or universal external-freshness certification.
The operator separately authorized a Kupua-only commit. The worklog is reset and
unrelated work remains untouched; no push is authorized. Step 5's first prospective
assignment is synthetic label-removal preparation, requiring fresh-agent confirmation.
No later execution or live-edit activation follows from this acceptance.

## 8. Representative Proof and Existing Assertions

| Behavioral gap | Existing home | Required witness |
| --- | --- | --- |
| Pre-operation and later below-floor reads | [API-mode store tests](../../src/stores/search-store-api-mode.test.ts), [enrichment hook tests](../../src/hooks/useEnrichedImage.test.ts) | Actually release stale data after publication; unrelated IDs still update; absence of capabilities is not merged away |
| Selected metadata and authority | [selection-store tests](../../src/stores/selection-store.test.ts), [multi metadata tests](../../src/components/MultiImageMetadata.test.tsx) | Off-screen accepted update, old hydration body and omission completions, same captured IDs, one revision/reconciliation |
| Full/lean standalone ownership | [detail tests](../../src/components/ImageDetail.test.tsx) | Populated original metadata survives; stale same-ID and departed-owner reads cannot publish |
| Receipt truth and bounds | [operation tests](../../src/lib/label-operation.test.ts), [editor browser tests](../../e2e/local/grid-mutations.spec.ts) | Ack is not observation; unknown plus observed state is not invented acknowledgement; deadline stops reads; no replay |
| Local continuity and exact targeting | [API-mode store tests](../../src/stores/search-store-api-mode.test.ts), [eviction cursors](../../src/stores/search-store-eviction-cursor.test.ts), [position maps](../../src/stores/search-store-position-map.test.ts) | Distant rank drift with normal cursor budget; edited boundary tuple, overlap/all-duplicate page, held null crossing and both coordinate thresholds |
| Pending navigation and ranges | [range tests](../../src/hooks/useRangeSelection.test.ts), [browse density](../../e2e/local/browse-density.spec.ts), [forced seek](../../e2e/local/forced-seek.spec.ts) | Current seek/direction survives publication and density; newer intent wins; exact remote range rejects stale authority and exited endpoint |
| Boxes and existing refresh | [density controls](../../e2e/local/density-controls.spec.ts), [Justified windowed](../../e2e/local/justified-windowed.spec.ts), [buffer integrity](../../e2e/local/buffer-corruption.spec.ts) | Metadata-only boxes stay still; rebase placement is coherent; B16 ticker success still goes to top and failure retains view |
| History, AI and synthetic topology | [history](../../e2e/local/browser-history.spec.ts), [API-mode store tests](../../src/stores/search-store-api-mode.test.ts), [command/editor browser fixture](../../e2e/local/grid-mutations.spec.ts) | Destination-only history, preserved AI ordinals, cold detail and built-hosted no-mutation proof |

Before editing assertions, identify these compatibility distinctions:

- Existing same-ID overlay replacement/shared-over-attached precedence and useful
  late hydration remain valid for ordinary reads; guarded own-write IDs need new
  acceptance rules, not global rejection of late metadata.
- Map survival and no-rank fast paths remain valid when ordering authority is valid.
  Do not delete them to accommodate the dirty-order path.
- Metadata-only notifications normally preserve a pending range; actual coordinate
  invalidation is a new reason to retire its acquisition, not its captured intent.
- B16 ticker/Home/history and normal Justified repacking assertions must not be
  weakened. A new internal rebase is not permission to edit their expected behavior.
- Boolean `observeSimulated` evidence is replaced by actual owned canonical readback
  for the new path; disconnected zero-dispatch and duplicate-intent tests remain.

Use representative cases for distinct owners and races, not a product of every sort,
tier, layout, topology and outcome. Reuse current readiness and box helpers; wait
for the right identity/owner, not desired coordinates or a convenient loading flag.
Preserve one-pixel geometry tolerances and existing timeouts. No retries or skips
count as passing acceptance.

### 8.1 Testing Layers and Ownership

**Test the failure modes aggressively, not every combination indiscriminately.**
The implementing agent owns automated proof and the visible synthetic rehearsal.
The operator owns judgment of the scrollable-set option (section 5.6) and any separately
approved performance campaign. A cold reviewer challenges the final implementation
and oracles; nobody treats a successful demonstration as universal certification.

| Layer | Purpose | Gate |
| --- | --- | --- |
| Deterministic owner/adapter tests | Prove state, request bodies, ownership, budgets, deadlines and adverse completion order | Failing-first cases plus full unit suite |
| Real browser regression tests | Prove production components, layout, input, history, media and transport composition | Existing API/compiled-hosted fixtures and full local E2E |
| Bounded sequence stress | Find interactions that individual cases miss | Replayable seeds, independent invariants and explicit operation/read bounds |
| Embedded-browser rehearsal | Let agent and operator inspect risky behavior in the actual UI | Required visible synthetic demonstration, not merely screenshots from a test runner |
| Performance qualification | Measure new publication cost, separately from functional correctness | Existing operator-run methodology, only for a named unanswered question |

### 8.2 A Small Reusable Scenario Harness

Reuse the existing API-mode transport stand-in, command/editor fixture plugin,
held-window tests and shared geometry/readiness helpers. Put shared scenario setup
in an existing suitable `e2e/shared/` owner where practical. One new test-only helper
is acceptable if there is no suitable owner; no new mock backend framework, product
route, runtime flag, dependency or alternative renderer.

The same scenario controls must drive automated tests and an isolated interactive
fixture page running the production app. A small fixture-only control strip may
choose a scenario, dispatch a simulated operation, hold/release a specific response,
advance the synthetic projection and reset the fixture. It is explicitly test UI,
not a product refresh control. Keep it outside the measured results geometry.

Keep command acknowledgement, projected document state, read issuance, response
snapshot and response delivery independently controllable. Capture old payloads
before changing the fixture so "release old read" really delivers old data. Support
request failure, successful omission and withheld capability as distinct outcomes.
Respect real cancellation; a callback already past the transport boundary is a
separate hostile-publication test, not an impossible successful aborted fetch.

Use true Argo shapes and independent expected IDs, tuples and membership for each
fixture. Do not derive expected geometry or accepted state from the helper being
tested. Large-scale scenarios represent a logical nine-million-image search with
bounded generated pages and explicitly modeled local changes, not nine million
allocated objects, a nine-million-entry map or a new general CQL interpreter.
Use populated, varied-aspect synthetic media with visible identity marks, so wrong
image reuse and blank content are observable; no live images or signed URLs.

Block unhandled API/ES/satellite/media traffic before app startup and before synthetic
IDs enter selection or prefetch. Allow only declared local fixture routes and app
assets; unexpected traffic fails closed and fails the test. The production command
executor remains disconnected. Isolated hosted configuration is synthetic, not a
request to contact deployed TEST. All generated assets/output stay under `kupua/`.

The interactive launcher, if needed, belongs only to test tooling and serves on an
unused loopback port. It must never reuse or reconfigure a live-backed app. Use the
existing fixture build/serve pattern; the embedded browser cannot simply inherit
another Playwright worker's route interceptions. Install equivalent fixture handling
in its own context or test server and verify it before navigation.

### 8.3 Named Adversarial Scenarios

Each row requires a recorded before-state, controlled event and independent outcome.
Use separate cases where timing changes ownership, not arbitrary timer sleeps.

| ID | Scenario | What must be observable |
| --- | --- | --- |
| T1 | Nine million logical results; scrolling/lookahead already active when a known own edit occurs 650,000 positions above the viewport; continue and reverse | Same local neighbourhood/surviving boxes, normal cursor/lookahead budget, no count/rank/map rebuild or new stall solely for the edit; useful progress continues |
| T2 | External distant change not signalled to this client, encountered by later normal reads | No new freshness polling; current reader tolerates rank drift without inventing exactness. This is not proof of detecting all external edits |
| T3 | Five resident images that fit the viewport; one gains a label, leaves the filter, moves in sort, or becomes explicitly unavailable | Confirmed deleted images disappear locally with a decremented count and no request; uncertain membership keeps fresh content in place; focus survives if its image does; no false deletion from a failed read |
| T4 | Old search/hydration/detail read held across accepted publication | Actually deliver the stale response; neither body, capability nor omission side effects undo current accepted state |
| T5 | Acknowledgement before projection; unknown outcome; one held peer; deadline then later projection | Truthful partial receipt, bounded reads, no replay, no held-group deadlock; uncertainty persists without a browsing lock |
| T6 | Edited boundary image changes sort key; duplicate/short/all-duplicate page; forward eviction and reverse prepend | Raw cursor makes bounded progress; incoming dedup never compacts survivors; no repeated-cursor loop or false exhaustion |
| T7 | Valued/null crossing in both directions; all-null data; tied keyword/special-date sort | Correct full tuples and local neighbours; filtered subquery total never becomes the whole display extent |
| T8 | Counts cross 1,000 and 65,000 while a map/rank/profile read is held | No surprise coordinate-regime flip or late authority restoration; map-ready and map-unavailable paths remain usable |
| T9 | Pending seek, density/zoom/panel change, then publication and newer input | Newest destination and existing placement policy win; no obsolete snap-back or doubled compensation |
| T10 | Off-screen selection and remote range; endpoint exits query; protected/unavailable target | Captured operation IDs stay fixed; no silently substituted range endpoint or eligible-subset mutation |
| T11 | Cold detail with full original metadata; navigation away/back during lean readback | Requested-ID ownership, retained full projection and current capabilities; no singleton fan-out |
| T12 | Finite AI results; edit then supported local resort | Membership/relevance ordinals survive; no automatic AI request or ordinary paging |
| T13 | Back/Forward, reload, Home logo, Home/End keys, ticker and pull-to-refresh | Existing distinct policies remain; history uses destination identity, not obsolete rank or departing anchor |
| T14 | Read failure, revoked capability and changed media URL during publication | No fake success/authorization, shell remains usable, metadata/boxes and actual current-media readiness checked separately |
| T15 | Repeated gestures, multi-label simulation preflight and resource limits | Exact fake dispatch count, no partial multi-label dispatch, no silent cap truncation; normal disconnected gestures unchanged |

T1 must include a client-known distant operation: an unobserved server change that
never notifies the client cannot falsify a bad global-invalidation implementation.
Compare with the same fixture and input without the edit. For moving geometry,
account for actually applied scroll input, not an assumed wheel distance. Observe
requests, store acceptance and frames **before admitted dispatch**, while scrolling
and useful lookahead are already active; continue through publication and late
follow-up work. A negative control that interrupts browsing at dispatch but recovers
before publication must fail. Final placement or post-publication smoothness alone
cannot satisfy T1.

The API-mode suite's existing `expectCoherentBuffer` compares buffer offsets to
current corpus ranks. Preserve that oracle for ordinary unchanged-order cases;
do not reuse it unchanged for retained-coordinate continuation, or weaken it globally.
The new continuation oracle independently checks displayed identities, slots, cursor
progress and admitted approximation without declaring those slots exact server ranks.

### 8.4 Coverage Without a Cartesian Explosion

Inventory supported sort tokens from the current registry/builders. Exercise each
supported token and direction in the cheap request/tuple layer where relevant.
Choose browser representatives for distinct algorithms: date/numeric estimation,
keyword/tie walking, selected-maximum special dates, configured aliases, null tails
and finite AI. Do not run all fifteen scenarios under every sort/layout/topology.

Distribute the named browser cases across resident, indexed and seek regimes and
Grid, Table and Justified. T1 is seek-regime; T3 is resident; T8 exercises indexed
boundaries. The metadata-only all-visible-box witness runs in all three layouts.
Include explicit and phantom focus, and one compact/coarse-pointer preservation
case without claiming completed mobile editing UX. Width alone is not touch emulation.

Normal E2E remains the direct-ES compatibility gate. API-composed and compiled-hosted
fixtures prove their actual respective paths and no ES fallback, not live-server
equivalence. No full suite against shared TEST is implied.

Seeded action sequences are deferred until Unit B exists. Then: start
with four fixed seeds of at most forty valid actions each, over a small independently
modeled corpus. Mix scroll/seek, selection, density, simulated publication, released
reads and history. Check after each settled action: identities/targets, reference
and coordinate ownership, bounded state/requests, and no forbidden mutation. A failed
seed must print a replayable sanitized action trace and be reduced to a small named
regression in an existing suite. No new property-testing dependency or random
unbounded browser soak is required.

Validate the test detector, too: an intentionally stale response, wrong identity,
known displacement or extra request must make the relevant assertion fail. Prefer
fixture negative controls; any temporary source break must be scoped, restored and
followed by the same focused passing check. A fixture that never reaches its hold
or never changes membership is failed setup, not a passing product result.

### 8.5 Mandatory Embedded-Browser Rehearsal

This is an executing-agent responsibility after the relevant implementation exists.
Do not postpone all browser work to the operator or substitute an automated report.
Read the [browser playbook](embedded-browser-playbook.md) and its
[controlled-race guidance](browser-playbook/instrumentation.md) first.

1. Coordinate a dedicated local synthetic fixture server/context and unused port.
  Open/share its page in the integrated browser, verify actual datasource, routes,
  served revision, selected regime and local media isolation. Do not take over either
  currently unshared page or treat a shared tab as live-system permission.
2. Bring the browser foreground and verify visibility. Announce the scenario and
  expected behavior in plain language, then use real wheel, keys, clicks and density
  controls. Store manipulation is allowed for declared setup, not to fake the result.
3. Rehearse at least T1 (distant change while scrolling), T3 (small set shows truth), T4 (old
  read released after new state), T6/T9 (one boundary/publication/density overlap),
  and T11/T13 (cold detail or history plus unchanged Home/ticker control). Include
  one failure/uncertainty outcome. Spread these over all three layouts and regimes
  without multiplying the whole matrix. The operator can request a replay or take
  the controls; that interaction is not a timing benchmark. For T1, arm observation
  before dispatch with scrolling/lookahead already active, not after the edit settles.
4. Use the fixture control strip for repeatable holds/releases. Run narrow timed
  races in one bounded in-page job so tool round-trip time does not determine the
  race. An automatic failsafe release marks the capture invalid. Leave stable
  before/after states visible for inspection without freezing production timers.
5. Observe both store acceptance and rendered identity/geometry. Take targeted
  screenshots at meaningful states, and use bounded frame/DOM observations for
  transient movement. Final screenshots alone do not prove absence of intermediate
  flashes; DOM/decode is not every-frame compositor proof. Do not claim a frame-time
  improvement from agent-paced tool calls.
6. End with aggregate pass/fail/read counts and observed UX, named gaps, and cleanup
  verification. Release held work/input, remove owned routes/listeners/probes and
  timer overrides, and stop only the fixture server owned for this rehearsal.
  Leave a useful synthetic state while the operator inspects it; keep isolation
  active until that state is unmounted or its owned context is closed.

The test evidence should record scenario, source revision, topology/regime/layout,
intervention and actual outcome, not just "looked fine". Sanitized synthetic traces
and selected screenshots may live under existing ignored test output. Promote only
useful reusable controls/regressions; remove one-off instrumentation. Do not create
a permanent generic QA dashboard or transfer live payloads into this public repo.

### 8.6 Acceptance and Limits

For Step-4 closeout (Unit D), require the named regressions, negative controls, full relevant suites
and the embedded rehearsal. Classify failures as product defect, invalid setup,
unsupported proposed policy or accepted pre-existing limitation, with evidence.
Never turn an unexplained failure into a retry, wider tolerance or longer timeout.

T1 fails on an avoidable count/rank/rebase request or suppressed useful prefetch,
even if final placement is correct. It also fails if the view merely stops moving
and calls that stability. T3 fails if a confirmed deleted image stays visible or
removal loses a surviving focus. Exact identities/permissions/outcomes never inherit the
large-set approximation allowance. A missing embedded-browser capability or blocked
fixture is an explicit incomplete gate, not permission to claim the rehearsal passed.

Synthetic nine-million counts certify the client scenario and bounded allocation,
not a nine-million-document backend's performance. Existing performance tools remain
the source of quantitative speed claims, with separate operator approval. No test
programme can promise all interleavings; the purpose is discriminating evidence for
these risks, with replayable failures and a scope an independent reviewer can inspect.

Commands run from repository root with foreground `pipefail` and live `tee` output:

```sh
set -o pipefail; npm --prefix kupua run test 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
set -o pipefail; npm --prefix kupua run build 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
set -o pipefail; npm --prefix kupua run typecheck:e2e 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
set -o pipefail; npm --prefix kupua run test:e2e -- --retries=0 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
```

Do not run them concurrently or edit files during E2E. Observe runner ownership of
ports 3000/3030/3040 and the local-ES safety check. Use the existing compiled-hosted
fixture's output under Kupua; ordinary `build:hosted` writes into Kahuna and requires
separate outside-directory permission. Performance campaigns/dry runs remain
operator-run; any live system check requires fresh per-session authorization.

## 9. Completion

The plan rests on independent read-only source reviews and challenge passes. They
are source analysis, not executed tests or performance evidence. Fixture harness
pieces in section 8.2 are built when the unit needing them starts, not up front.

**Step 4 is complete only when** the accepted policy, all four units and their
required gates are satisfied; current owners agree on accepted image state;
invalid coordinates cannot silently drive fresh reads; and representative browser
journeys preserve the specified boxes, destination intent and existing workflows.
A new stale flag, a successful one-image happy path or a green isolated unit test
is not completion. No live editing is enabled by Step-4 closeout.

## 10. Simplification Candidates Noticed (Not Authorized)

This work touches the core of an AI-written app. Record opportunities here as they
are spotted; each needs its own operator decision and perf campaign. None is a
prerequisite for step 4, and none may be folded silently into a unit.

| Area | Observation | Possible direction |
| --- | --- | --- |
| Search store size | The large search store's `extendForward` and `extendBackward` paths remain near-mirror implementations | One shared page-publication helper owning dedup, eviction and cursor recomputation for both directions; separate from the selected metadata publisher |
| Cell data sources | Grid cells read some fields from raw `image`, others from `useEnrichedImage`; Justified skips enrichment | Broad per-cell unification is not justified by A2: the buffer route reaches current consumers without it. Revisit only for a demonstrated remaining body/authority inconsistency |
| Image copies | Buffer, selection LRU, enrichment map, attached enrichment and standalone detail retain different owners/lifetimes | A3's [grouped publisher](../../src/lib/image-publication.ts) includes current full-detail delivery and touched-read acceptance. No general entity cache or broader owner unification is selected |
| Enrichment upsert | Copies an accumulated map not bounded by the 1,000-image buffer | Bound or prune by residency, with a perf check |
| Timer-gated scroll | Seek and post-extend cooldowns gate spurious extends by elapsed time | Event-based readiness, only if campaigns show the timers cost smoothness |
| Historical comments | Code comments cite past agents and audits (for example "APPROACH #4 (Agent 10)") | Replace with one-line statements of the current invariant when the code is next touched |
| Grouped publication | A3 publishes each verified group with one resident copy, one enrichment update and one selected-metadata action; the single-image helper delegates to it | No further abstraction is selected. Do not reintroduce per-target copies, a generic event bus or another body cache |
| Accepted reads and selected metadata | A3 integrates accepted touched-ID reads with selected metadata at existing response owners; ordinary untouched late-read behavior remains | Do not broaden this into universal freshness, a permanent page-scanning subscriber or hydration as post-write refresh |

**Post-A2 assessment, 6 November:** no additional Section-10 refactor is folded
into A2. The small shared publisher is already part of the selected implementation;
grouping and accepted-read integration belong to the separately started A3 contract,
not speculative optimizations. Paging deduplication/refactoring, enrichment pruning
and replacing scroll cooldowns have wider ownership/performance consequences and
no demonstrated benefit necessary for this choice. Broad per-cell normalization
would reintroduce coordination complexity the accepted buffer route avoids.

The only additional repair during cleanup was test-fixture dependency-cache
isolation, justified by the recorded React-module 404 during parallel validation.
It does not change application caching or scrolling. The unexplained table-sort
timeout is retained in A2's validation caveat, not promoted to a known product bug
or used to justify speculative sorting changes. This is a bounded assessment of
opportunities exposed by A2, not a fresh whole-store audit or performance study.

## Appendix A: Reading Guide for Independent Review

Read these first; they supply current contracts, not a mandate to repeat the old
research programme:

1. [AGENTS](../../AGENTS.md), [editing plan](gradually-growing-teeth.kupua-edits-steps.md), [KUP-043](bug-backlog.md#kup-043), and this plan's authority/policy sections.
2. [State ownership](00%20Architecture%20and%20philosophy/state-management.md), [focus/position](00%20Architecture%20and%20philosophy/02-focus-and-position-preservation.md), [scrolling](00%20Architecture%20and%20philosophy/03-scroll-architecture.md), [history](00%20Architecture%20and%20philosophy/04-browser-history-architecture.md), [selections](00%20Architecture%20and%20philosophy/05-selections.md).
3. [Component reference](00%20Architecture%20and%20philosophy/component-detail.md), [keyboard navigation](00%20Architecture%20and%20philosophy/keyboard-navigation.md), [scrubber/null-zone reference](00%20Architecture%20and%20philosophy/scrubber-ticks-and-labels.md).
4. [API contract](../../src/dal/grid-api/README.md), [hosting/data modes](00%20Architecture%20and%20philosophy/09-deployed-via-Kahuna.md), [capabilities](hosted-rights-and-capabilities-review.md), [safeguards](infra-safeguards.md).
5. [Request lifetime/parity](api-request-lifetime-and-performance-parity.md), especially decision summary and section 8; [scroll continuity evidence](scroll-horizons-thumbs-and-blocking.md); [performance operation](../../e2e-perf/README.md), [measurement contracts](../../e2e-perf/measurement-reference.md), [E2E proof contracts](../../e2e/README.md).
6. For the required visible rehearsal: [embedded-browser playbook](embedded-browser-playbook.md) and [fixture isolation, controlled races and cleanup](browser-playbook/instrumentation.md).

Consult when a particular premise needs provenance:

- [Completed API build decisions](03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md): PIT-less API, mget versus singleton, AI and topology limits. Later explicit data-mode directives supersede historical development fallbacks.
- [P23 timestamp provenance](03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-09-p23-query-mapping-s1.md#f4-identity-and-edited-date-provenance-are-now-joined) and [P33 write lifecycles](03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-09-p33-grid-edit-delete-collection-lifecycles.md): historical source evidence, recheck controlling code.
- [Batch editing](batch-editing-at-scale.md): source/event/projection and capacity distinctions; its older universal count/conflict/cap claims are not current acceptance.
- [Archived Justified plan](zz%20Archive/justified-density-prototype-plan.md): geometry and density-continuity rationale only. Archived execution/review gates are not active instructions.

These documents are the reading set, not a claim of line-by-line repository review.
Existing measured results retain their version/topology limits.

## Appendix B: Related Code and Source Evidence

Paths and line anchors identify the inspected baseline; recheck after implementation.

| Concern | Entry points |
| --- | --- |
| Existing operation and dedup ownership | [label-operation.ts](../../src/lib/label-operation.ts#L44), [label-editor-store.ts](../../src/stores/label-editor-store.ts#L24), [grid-commands.ts](../../src/lib/grid-commands.ts#L73) |
| Normalization/readback/scope | [API mapper](../../src/dal/grid-api-search-adapter.ts#L53), [browse body defaults](../../src/dal/grid-api-search-adapter.ts#L132), [mget](../../src/dal/grid-api-search-adapter.ts#L187), [count](../../src/dal/api-data-source.ts#L122) |
| Publication and precedence | [enrichment](../../src/stores/enrichment-store.ts#L88), [hook](../../src/hooks/useEnrichedImage.ts#L28), [selection cache](../../src/stores/selection-store.ts#L538), [panel owner](../../src/routes/search.tsx#L328), [standalone detail](../../src/components/ImageDetail.tsx#L255) |
| Paging/rank validity | [map publication](../../src/stores/search-store.ts#L1471), [forward extension](../../src/stores/search-store.ts#L2849), [backward extension](../../src/stores/search-store.ts#L2984), [seek](../../src/stores/search-store.ts#L3179), [cursor restore](../../src/stores/search-store.ts#L4274) |
| Geometry and demand | [tier decision](../../src/lib/two-tier.ts#L10), [data window](../../src/hooks/useDataWindow.ts#L373), [Justified construction](../../src/components/ImageGrid.tsx#L491), [windowed layout](../../src/lib/windowed-justified-layout.ts#L40), [scroll placement](../../src/hooks/useScrollEffects.ts#L354), [table content](../../src/components/TableRowCells.tsx#L55) |
| Identity-based actions | [cursor cache](../../src/lib/image-offset-cache.ts#L59), [range owner](../../src/hooks/useRangeSelection.ts#L137), [traversal](../../src/hooks/useImageTraversal.ts), [history snapshot](../../src/lib/history-snapshot.ts#L15), [continuity](../../src/lib/search-continuity.ts) |
| Preserve existing resets | [refreshResults](../../src/lib/refresh-results.ts#L6), [Home owner](../../src/lib/reset-to-home.ts), [B16 browser assertions](../../e2e/local/buffer-corruption.spec.ts#L42) |
| Existing synthetic integration | [local/compiled-hosted suite](../../e2e/local/grid-mutations.spec.ts#L224), [label fixture](../../e2e/shared/label-editor-fixture.tsx), [API-composed store fixture](../../src/stores/search-store-api-mode.test.ts#L72) |
| Label predicate limits, read-only evidence | [query builder phrase rewrite](../../../media-api/app/lib/elasticsearch/QueryBuilder.scala#L106), [structured label filter](../../../media-api/app/lib/elasticsearch/QueryBuilder.scala#L211), [body parser](../../../media-api/app/lib/elasticsearch/ElasticSearchModel.scala#L550), [mapping](../../../common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/Mappings.scala#L264) |
| Projection and timestamp limits | [lean source](../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L753), [canonical writer](../../../media-api/app/lib/ImageResponse.scala#L362), [metadata projection guard](../../../thrall/app/lib/elasticsearch/ElasticSearch.scala#L242) |

Independent review should try to break the contract with concrete interleavings:
late same-ID data, withdrawn capability with old metadata, changed boundary tuple,
all-duplicate page, threshold crossing, obsolete seek after density change, missing
history/range endpoint, and cold detail receiving a lean response. Separately ask
whether the added reads, state and invalidation are the least complexity required.
Reject unsupported guarantees instead of growing infrastructure to defend them.