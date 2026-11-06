# Step 4: Fresh Edits Without Losing Your Place

**Implementation plan, 5 November 2026. Section 1 choices accepted; Unit A
(sessions A1-A3, section 7) is authorized. The Unit B spike and Units B-D are not.**
This expands [editing Step 4](gradually-growing-teeth.kupua-edits-steps.md#step-4-resolve-kup-043-with-simulated-writes-before-enabling-real-ones)
and [KUP-043](bug-backlog.md#kup-043), after the completed disconnected desktop editor.
It rests on independent read-only source reviews, not executed regression tests,
deployed-service certification or measurements of the proposed design.

All work stays inside `kupua/`. No live writes, service/safeguard changes,
deployment, dependency addition, staging, commit or push follows from this plan.
The operator runs e2e-perf campaigns after meaningful steps; current smoothness
is the acceptance baseline, not an aspiration.

### UX Invariants (Operator, Non-Negotiable)

- Scrolling stays as smooth as now. Cells never twitch, dance or swim because of
  an edit, a late read or bookkeeping repair.
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

Accepted by the operator; revisit after seeing Unit A rather than by rereading:

| Choice | Recommendation | Consequence |
| --- | --- | --- |
| First observation path | Bounded mget readback with exact returned-label comparison; no mandatory count-first hop | Correct for labels the query language cannot express exactly; potentially more response bytes, fewer dependent requests for one image |
| Global rank stale during ordinary browsing | Continue from retained scan frontiers in stable display coordinates; keep useful lookahead | No rank/count/rebase tax solely for distant changes or an unresolved receipt; prove overlaps, exhaustion and eviction separately |
| Scrubber input across invalidation | Preserve track/drag fraction; preserve an explicitly requested numeric ordinal as an ordinal, never as an image identity | A changed total can change the resulting numeric position; existing approximate deep landing remains approximate |
| Range endpoint leaves the query | Refuse that off-window range without changing the current selection | Never substitute a different endpoint or silently choose a subset |
| Unavailable slots | Compact when the whole result set fits the viewport; otherwise keep layout space (section 5.6 options for scrollable resident sets); skip confirmed unavailable slots during traversal/range actions, while an already-open detail can show unavailable | No loading skeleton for a terminal unavailable entry; no inferred deletion from a failed/omitted read |
| Initial resource budget | One active single-label simulated observation group, at most 200 captured IDs; three mget attempts, at least one second apart, ten-second deadline starting immediately before first fake dispatch | Prototype proof bounds, not a write-capacity certificate or a production batch scheduler; disconnected comma-separated preparation is unchanged |
| Freshness-fact lifetime | Document-lifetime metadata floors for at most 1,000 distinct touched IDs; refuse new simulation admission at capacity | No silent eviction of freshness protection; browsing stays usable, no compulsory reload |

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

If Unit B is later authorized, a feasibility spike (section 7) first proves the minimal separation of scan frontiers,
display slots and trusted ranks in existing owners. If it needs a second enumeration
engine, unbounded visited IDs or a material browsing cost, stop for a design decision.
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

Retain selected IDs and operation targets. Disable actions for confirmed unavailable
or deleted targets. If a range contains such slots, its admitted target set and
unavailable accounting must be explicit, not a hidden eligible-subset execution.
Existing operation admission continues to block unresolved/ineligible targets.

**Small sets show the truth.** When the whole result set fits the viewport (no
scrolling is possible), there is no position to protect. Remove confirmed deleted
images locally and decrement the count: no request is needed, because the client
already holds the evidence. Kahuna does exactly this for all deletions. Images whose
membership is only uncertain (for example a label edit under an arbitrary CQL
filter) keep their box with fresh content; the client must not guess CQL. The
fits-viewport fact belongs to the mounted view, not the store.

**Option for uncertain membership in small sets (undecided):** rerun the current
query once after publication, so filter-exited images also disappear. One ordinary
search for at most a screenful; the operator decides after seeing local removal.

**Scrollable sets: undecided, operator chooses after seeing Unit C.**

| Option | Behavior | Risk |
| --- | --- | --- |
| A (default for first implementation) | Keep unavailable/filter-exited slots until the next deliberate transition | Stale entries remain visible; zero movement |
| B | Compact entries outside the viewport; keep visible ones until the user scrolls away | No visible movement in Grid/Table; Justified rows below may repack when reached; needs offset/cursor bookkeeping |
| C | Compact everywhere with anchor compensation | Visible rows shift or Justified repacks in view: violates the no-twitch invariant unless proven otherwise |

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

Known source costs: result-array replacement rebuilds Justified layout and calls
virtualizer `measure()`; it also resets the velocity baseline. Full selection
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
A2 has not started and still requires its operator checkpoint. No editing transport
or publication machinery is connected.

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

### A2: Publication Route Comparison (Authorized)

Grid cells read labels, description
and dates from the raw `image` prop; Justified cells skip enrichment; table rows
memoize on `image`. So published content must reach the `image` the cell renders.

| Route | How | Cost/risk |
| --- | --- | --- |
| Buffer replacement | New `results` array with edited bodies at the same indices | Simple, one source of truth; rebuilds Justified layout, calls `measure()` and resets velocity baseline (section 6) |
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

### A3: Readback, Freshness and Publication (Authorized After A2's Choice)

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

### Feasibility Spike Before Unit B (Not Authorized)

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

### Unit B: Stable Continuation and Coordinate Trust (Not Authorized)

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

### Unit C: Unavailable Slots and Cross-View Acceptance (Not Authorized)

Add the minimum explicit unavailable/deleted publication state needed by synthetic
fixtures, with stable boxes and disabled actions. Cover surviving/missing anchors,
resident traversal, off-window range refusal, AI relevance preservation, cold detail
and a density change during pending reacquisition. No delete command is implemented.

The geometry assertion for metadata-only publication covers every retained visible
box in Grid, Table and Justified. Rebase asserts its elected destination/anchor under
the selected action policy. Existing normal Justified repacking assertions remain
intact rather than being reclassified as new Step-4 failures.

### Unit D: Integrated Gates and Closeout (Not Authorized)

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
| Search store size | `search-store.ts` is about 4,800 lines; `extendForward` and `extendBackward` are near-mirror implementations | One shared page-publication helper owning dedup, eviction and cursor recomputation for both directions |
| Cell data sources | Grid cells read some fields from raw `image`, others from `useEnrichedImage`; Justified skips enrichment | One per-cell image view so publication and enrichment arrive the same way |
| Image copies | Buffer, selection LRU, enrichment map, attached enrichment and standalone detail each hold image data | A single publish entry point that updates every owner, rather than a shared cache |
| Enrichment upsert | Copies an accumulated map not bounded by the 1,000-image buffer | Bound or prune by residency, with a perf check |
| Timer-gated scroll | Seek and post-extend cooldowns gate spurious extends by elapsed time | Event-based readiness, only if campaigns show the timers cost smoothness |
| Historical comments | Code comments cite past agents and audits (for example "APPROACH #4 (Agent 10)") | Replace with one-line statements of the current invariant when the code is next touched |

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