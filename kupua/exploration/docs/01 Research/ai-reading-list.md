# AI / Embeddings — Reading List and Exploration Notes

> **Status:** exploratory. Nothing here is committed work. This is a curated
> map of what's possible with the Cohere V4 embeddings already in ES, with
> emphasis on the directions the team is genuinely interested in.
>
> Companion to `ai-search-landscape.md` (what exists) and
> `ai-search-workplan.md` (Phase 1, shipped). This doc is "Phase N+1
> brainstorming, sorted for usefulness."

---

## Why a reading list

We have 256-dim Cohere V4 embeddings on (eventually) every image in ES.
Phase 1 used them for one thing: text-to-image semantic search. The
embeddings themselves are a far more general capability than that — they
are a continuous semantic handle that ES otherwise doesn't have on its
content.

The two directions this doc takes seriously:

1. **Auto-categorisation into a defined taxonomy** (the "kind of"
   aggregations embeddings *can* help with — when paired with a label
   vocabulary). This is the way out of Grid's near-total reliance on
   the ancient ANPA Subjects field.
2. **Same-shoot grouping** (clustering by visual + temporal proximity).
   Real workflow problem; the UX is the hard part.

Plus brief notes on three smaller directions worth keeping in mind, and
an explicit "not worth pursuing yet" list at the end.

---

## §1 Auto-categorisation into Standard Taxonomies

### §1.1 The problem

Grid currently exposes the ANPA Subject codes — a vocabulary from the
late 1970s, designed for wire copy, with categories like "POLITICS",
"SPORT", "BUSINESS." Agencies that bother to populate it use a small
subset; most images arrive without subject metadata at all. The richer
IPTC controlled vocabularies (Scene, Genre, World Region, Mediatopic)
are almost never populated by agencies even though they exist:

- **Scene** (https://cv.iptc.org/newscodes/scene/) — ~60 entries.
  "Action", "Aerial view", "Close-up", "Group", "Portrait", "Symbolic",
  "Side view", "Profile", "Underwater", etc. **Visual** categories.
- **Genre** (https://cv.iptc.org/newscodes/genre/) — ~80 entries.
  "Press conference", "Demonstration", "Portrait", "Reportage",
  "Studio shot", "Wildlife", etc. **Semantic** categories.
- **Mediatopic** (https://cv.iptc.org/newscodes/mediatopic/) — ~1100
  entries, hierarchical. The replacement for ANPA Subjects.
- **World Region** — geographic, less interesting (Grid already has
  location data via other paths).

The pitch: **use embeddings to assign these labels at query or ingest
time, without a separate trained classifier.** This is the technique
called *zero-shot classification by embedding similarity*, and it's
robust enough to be useful out of the box.

### §1.2 How zero-shot classification works

1. Embed each taxonomy label as a text prompt: e.g. "a portrait photo",
   "a press conference photo", "an aerial view." Cohere V4 embedding,
   same model as images.
2. For a given image, compute cosine similarity between its image
   embedding and every label embedding.
3. Top-k label by similarity = the predicted categories. Above a
   threshold = "confident."

This is exactly how CLIP zero-shot ImageNet classification works (and
how LAION's open CLIP variants do it). For ~60-1100 labels this is
tractable: pre-compute the label embeddings once, store them as a fixed
matrix; the per-image scoring is a single matrix multiply.

**Critical caveats:**

- **Prompt engineering matters more than people admit.** "a portrait
  photo" ≠ "portrait" ≠ "headshot of a person." Wrap each label in
  several phrasings and average the embeddings ("prompt ensembling" —
  standard CLIP trick). Improves accuracy by 1-5 points usually.
- **Calibration is hard.** The cosine score is not a probability;
  thresholding "is this confidently a portrait?" requires a held-out
  set per label. Without calibration you get either too many false
  positives or too many misses.
- **Cohere V4 was trained as a search model, not a classifier.** It
  may classify well, or it may be worse than a dedicated model
  (OpenCLIP, SigLIP, EVA-CLIP). Worth a 1-day spike on 100 hand-
  labelled Grid images before committing.
- **Hierarchical taxonomies (Mediatopic) need structural awareness.**
  Flat top-k is wrong when "Sport" and "Football" are both correct.
  Standard fix: classify at each level of the hierarchy independently,
  or use hierarchical softmax.

### §1.3 Where this lives — server-only

This is **server-side, batch-or-ingest**, not client-side:

- Label embeddings (~100KB for 1100 Mediatopic labels) live once on the
  server. No reason to ship them to the browser.
- Per-image scoring at ingest: ~1ms per image after the embedding is
  computed. Trivial to bolt onto `image-embedder-lambda`.
- Per-image scoring at query time: feasible (it's still a matrix mul)
  but pointless — the labels don't change per query.
- The labels themselves go into ES as a new field
  (`aiLabels.scene`, `aiLabels.genre`, `aiLabels.mediatopic`),
  each holding an array of `{label, confidence}` pairs.
- Now Grid can aggregate, facet, and filter on these like any other
  metadata field. Tickers, filters, "is:portrait" — all the existing
  machinery works.

**Kupua's role:** zero work until the field appears. Once it does,
the field registry gets new entries, the Filters panel picks them up
automatically, typeahead supports `scene:portrait`. The hard work is
upstream.

### §1.4 The "I was wrong earlier" point

My earlier brainstorm said "embeddings won't help with aggregations."
That was wrong as stated — what I meant is: *embeddings don't help you
count what's already in the index.* But they very much help you
**produce structured labels** that can then be counted, filtered, and
faceted with the normal aggregation tools. The categorical
"semantic-but-discrete" use cases are exactly the gap that ANPA Subjects
fails to fill.

### §1.5 Prior art

- **CLIP zero-shot ImageNet** (Radford et al. 2021, *Learning Transferable
  Visual Models From Natural Language Supervision*). The original demo
  that opened this entire field.
  https://arxiv.org/abs/2103.00020
- **OpenCLIP zero-shot benchmarks**
  https://github.com/mlfoundations/open_clip — extensive evaluation
  tables, prompt-ensemble examples. The README is the most practical
  introduction.
- **LAION CLIP-retrieval demo**
  https://rom1504.github.io/clip-retrieval/ — query-by-image, zero-shot
  labels, compositional prompts all in one browser tool. Worth half
  an hour to play with.
- **IPTC NewsCodes**
  https://iptc.org/standards/newscodes/ — the canonical landing page
  with downloads of all vocabularies as RDF/SKOS.
- **Pinterest's "Unifying visual embeddings for visual search at
  Pinterest"** (Zhai et al., KDD 2019) — production system that
  classifies pins into visual categories using embeddings. Their
  "PinSAGE → label" pipeline is the closest published architecture
  to what we'd build.
- **Auto-tagging with vision-language models, practical guide**
  (Roboflow blog, 2023) — short, practical walkthrough of zero-shot
  labelling with prompt ensembling.
  https://blog.roboflow.com/zero-shot-image-classification-clip/
- **Cohere Embed V4 multimodal cookbook**
  https://docs.cohere.com/docs/multimodal-embeddings — the
  vendor-specific quirks (matryoshka truncation, image-vs-text
  embedding-type handling, batch limits). Required reading before
  any production use.

### §1.6 The order I'd attack this in

1. Hand-label 100-200 Grid images with Scene + Genre. This is the
   evaluation set; everything else is meaningless without it.
2. Spike: zero-shot Cohere V4 against those labels. Measure top-1,
   top-3, calibrated-threshold precision/recall.
3. If Cohere V4 underperforms, spike OpenCLIP or SigLIP. (We have the
   image bytes; embedding with a different model is a Lambda change.)
4. Pick the best taxonomy + model combination, design the ES schema
   change with the platform team.
5. Backfill, then expose in kupua via field-registry entries.

Steps 1-3 are a few-day spike that gives you a real go/no-go signal.
**Don't commit to shipping anything without 1-3 done first** — zero-shot
quality varies wildly by domain and the news-photography distribution
is unusual (lots of press-conference framing, atypical lighting).

---

## §2 Same-Shoot Grouping

### §2.0 Related but distinct: "More like this"

Same-shoot grouping is the *automatic* version of one specific
More-Like-This use case: "show me frames like this one, narrowly."
The broader More-Like-This feature (in the workplan) has *two* modes
— same-vibe and varied — discussed in §3.0. Worth reading §3.0
alongside this section: same-shoot grouping is essentially
same-vibe MLT pinned to a high similarity threshold with cluster
semantics layered on top.

### §2.1 The problem

A picture editor receives 40 frames from a press call. They have the
same `byline`, similar (often identical) `dateTaken`, similar `caption`
text, often the same `location`. Today Grid can group on byline+date,
which works ~70% of the time and fails when:

- Two photographers covered the same event (different bylines, same shoot).
- Burst-mode timestamps differ by milliseconds across minutes of
  coverage, and `dateTaken` precision varies by agency.
- The shoot spanned multiple locations (politician walks-and-talks).
- Wire-service captioning normalises everything ("AP photo of …") so
  text similarity collapses.

Embeddings sidestep most of this. Frames from the same shoot are usually
near-duplicates visually — same lighting, same room, same subjects —
and cluster tightly in embedding space (cosine ~0.92-0.98 typical).

### §2.2 Two operations, one mechanism

**Operation A — "Show me other frames from this shoot."** Given a seed
image, KNN with a high min-similarity threshold (~0.9). The result is
the shoot. ~5-50 images typical. Pure runtime query, no batch
preparation needed.

**Operation B — "Show me all shoots in the current result set."** Given
a result set of N images, cluster them by embedding similarity. Each
cluster = a shoot. Useful when an editor searches "Starmer in May" and
gets back 300 images that decompose into 18 distinct events.

A is trivially implementable on the data we have. B is the interesting
one and the UX problem.

### §2.3 The clustering algorithm choice

For Operation B, three viable algorithms:

- **DBSCAN with cosine distance.** Density-based, doesn't require
  pre-specifying cluster count. Two parameters: `eps` (distance
  threshold) and `min_samples` (minimum cluster size). Both stable
  across runs. Standard, well-understood, fast enough for 200-1000
  images. **My default recommendation.**
- **Chinese Whispers** (Biemann 2006). Graph-based, runs in linear time
  on the edge list. Used by face-recognition systems (e.g. `dlib`'s
  built-in clustering). Beats DBSCAN on weird shapes but harder to
  tune.
- **HDBSCAN.** Hierarchical DBSCAN; produces a dendrogram and copes
  better with clusters of varying density. More complex; only worth it
  if simple DBSCAN underperforms on real data.

**Don't use k-means** — requires guessing the cluster count and assumes
spherical clusters, neither of which matches shoot structure.

For an in-browser 200-result re-clustering, DBSCAN on cosine distance
in pure JS is ~50 lines and runs in well under 100ms. For a backfilled
"shoot ID" stored on every image, the same algorithm runs server-side
across the whole index in batches.

### §2.4 The UX problem

This is the hard part. Two opposed failure modes:

**Failure mode 1 — invisible.** If the grouping just silently dedupes
("we showed you 1 of 40 frames from this shoot"), the editor doesn't
realise the others exist and might miss a better frame.

**Failure mode 2 — disruptive.** If the grouping breaks the chronological
ordering ("here are 18 shoots, expand each to see frames"), it
fundamentally changes how the result set is laid out, which conflicts
with kupua's whole "single ordered list" principle (`03-scroll-architecture.md`,
`01-frontend-philosophy.md`).

Three UX shapes worth considering, ranked by how disruptive they are:

#### Shape A — non-disruptive: "shoot indicator" on each image

A small badge on each image showing "1 of 12 in this shoot." Click the
badge → modal/sidebar shows the other 11. Result list stays as-is.

- **Pros:** Zero disruption to the ordered list. Editors who don't care
  can ignore it. Implementation lives in the cell renderer and one
  modal.
- **Cons:** Doesn't help discovery. If 38 of your 40 results are from
  3 shoots, you waste scroll on near-duplicates without realising.
- **Verdict:** Cheapest win. Probably do this first. Costs almost
  nothing and unblocks operation A workflow ("show me other frames
  like this").

#### Shape B — opt-in: a "group by shoot" toggle in the filters panel

A toggle that, when on, collapses each shoot to one representative
image with a count badge. Click → expands inline (or in a side panel,
or in a modal).

- **Pros:** Editor controls when to switch modes. Discoverable. The
  result-set count changes from "300 images" to "18 shoots" which is
  often what the editor actually wants to know.
- **Cons:** Conflicts with the buffer architecture — "300 images,
  group to 18" requires either clustering all 300 (server-side
  pre-computation) or accepting that groups change as you scroll
  (visually horrible). The clean version requires a stored `shootId`
  field, set at ingest, so the grouping is just a SQL-equivalent
  `GROUP BY` ES aggregation. Without that, this is a UX trap.
- **Verdict:** Wait until shoot IDs are stored. Don't fake it
  client-side.

#### Shape C — multi-step elimination workflow

This is what the user described: "for a multi-step elimination/discovery
process." Hypothesised flow:

1. Editor searches broadly ("Starmer May").
2. Sees 300 results, ungrouped, in chronological order (normal).
3. Spots a representative frame from a shoot they want to dismiss
   ("the morning's school visit — already covered yesterday").
4. Right-click → "Hide this shoot." All ~30 frames from that shoot
   disappear from the result set.
5. Repeat. After 5-6 dismissals the result set is down to the
   handful of shoots that actually matter.

The opposite flow also works: "Keep only this shoot" → solo it.

- **Pros:** Composes with normal browsing. Doesn't require pre-grouping
  the whole index. Solves the actual editor problem (sifting through
  redundant coverage).
- **Cons:** Requires server round-trip per shoot for accurate KNN
  expansion (the 30 frames aren't necessarily all in the current
  result set), OR works only on the in-buffer frames (faster but less
  complete). Need to decide. URL representation is awkward —
  `?dismissedShoots=imageId1,imageId2,…` is ugly but works.
- **Verdict:** Most interesting direction. **Spike it on paper first**
  — sketch the flows, watch one editor work through three real
  searches, decide whether the workflow actually feels right before
  building.

### §2.5 The "are these really the same shoot" failure modes

Visual clustering is not ground truth. Failure cases that **will** happen:

- **Two photographers, same event, same angles** — embeddings cluster
  them together. Probably correct ("same shoot" semantically) but might
  surprise the editor expecting per-byline grouping.
- **One photographer roaming a venue** — embeddings might form 3-4
  sub-clusters (entrance, podium, crowd reactions, exit). Correctly
  "same shoot" by metadata, but clustered as 3-4 by visual. Both
  answers are defensible.
- **Cropped/reframed versions of the same frame** — cluster tightly
  even though they're versions, not separate frames. May want to
  combine "shoot clustering" with the existing version-detection.
- **Different events with the same backdrop** — Number 10 doorstep
  every day, same lobby every press call. Embeddings will say "same
  shoot" wrongly.

The honest framing: visual clustering is a *signal*, not a fact.
Combine it with date (within hours) and byline (with override-when-
photographer-swapped logic) for production quality. Pure-visual works
as a 70% solution for a discovery UI, not as a hard grouping.

### §2.6 Prior art

- **Cooper, Foote, Girgensohn, Wilcox — "Temporal event clustering
  for digital photo collections"** (ACM TOMM 2005). The foundational
  paper on shoot grouping. Their signal-fusion approach (time + colour
  + metadata) is what Apple Photos' "Moments" implements. Pre-dates
  modern embeddings but the framework is unchanged.
  https://dl.acm.org/doi/10.1145/1057792.1057795
- **Chinese Whispers** (Biemann 2006). Original paper on the graph
  clustering algorithm that face-recognition systems use for
  same-person clustering. Same idea applies to same-shoot.
  https://aclanthology.org/W06-3812/
- **Apple Photos "Moments" / "Memories" architecture.** Apple has
  presented bits of this at WWDC over the years; the most useful
  public source is the *Photos Knowledge Graph* talk (WWDC 2019).
  Their signal stack: time gaps + location clusters + face clusters
  + scene similarity. The fact that they use *all four* and still
  ship occasional howlers is the lesson.
- **dlib's `chinese_whispers_clustering`** — reference implementation
  used in many face-recognition pipelines.
  http://dlib.net/face_clustering.py.html
- **HDBSCAN docs** — the best practical intro to density-based
  clustering parameter tuning.
  https://hdbscan.readthedocs.io/

---

## §3 Other Useful Directions (Brief)

### §3.0 "More like this" has two modes: same-vibe and varied

The More Like This feature already in the workplan is really two distinct
user intents that happen to share a starting point (a seed image):

- **More of the same.** "I like this frame, give me 30 near-identical
  alternates so I can pick the best one." Plain KNN, high min-similarity
  threshold. This is what naïve MLT delivers and what editors expect when
  triaging a single moment.
- **More similar but varied.** "This frame is in the right direction; show
  me 30 *related* images that I might not have found by browsing." Pure
  KNN here is *bad* — it returns 30 near-duplicates of the seed and
  collapses the discovery space. This is exactly what MMR (Maximal
  Marginal Relevance) was invented to fix: at each step, pick the next
  result that maximises `λ·sim-to-seed − (1−λ)·max-sim-to-already-picked`.
  λ tunes the trade-off (1.0 = pure relevance, 0.0 = pure diversity).

The earlier draft of this doc dismissed MMR as "engineers love proposing,
editors don't want." That was wrong. The framing should be: editors
asking for "more like this" are *sometimes* in same-vibe mode and
*sometimes* in varied mode, and conflating them produces frustrating
results in both directions (same-vibe asker gets unrelated images;
varied asker gets 30 copies of the seed).

**UX shape worth considering:** the More Like This affordance is two
buttons (or one button with a toggle), labelled something like
"More of this" and "Explore around this." The same backend KNN call
returns ~k=500 candidates; the client either renders the top-N as-is
(same-vibe) or runs MMR client-side to pick a diverse N (varied).
λ doesn't need a UI control — pick one reasonable value per mode
(maybe λ=0.5 for varied) and ship.

**Implementation cost:** trivial on top of the existing KNN path. MMR
is ~30 lines of client-side code on a 500-image result set. The cost
is entirely in the UX decision and the labelling.

**Where this lives:** client-side post-processing on a larger KNN
result. Server returns k=500; client picks top-N either greedily
(same-vibe) or via MMR (varied). No new server endpoint, no new index
fields.

**Reading:**
- **Carbonell & Goldstein, "The use of MMR, diversity-based reranking
  for reordering documents and producing summaries"** (SIGIR 1998).
  Six pages, still the reference. Read this before implementing.
  https://dl.acm.org/doi/10.1145/290941.291025
- **Determinantal Point Processes for Machine Learning** (Kulesza &
  Taskar, 2012) — the mathematically principled version of "diverse
  set selection." Heavier; almost no one ships DPPs for this in
  practice because MMR is good enough. Cite it in design discussions
  to look thoughtful; don't actually implement it unless MMR
  underperforms.
  https://arxiv.org/abs/1207.6083
- **Pinterest's "Related Pins" / "More ideas" surfaces** are the
  best-known production examples of mixing same-vibe and exploratory
  intent on a single tile. Their engineering blog has discussed the
  same-vs-varied tension in several posts.

### §3.1 Compositional / negative queries (was #2 in brainstorm)

"X but more like Y", "snow scenes without skiers." Mechanically simple:
average or subtract query embeddings before KNN. The question is whether
Cohere V4's embedding space supports clean arithmetic — CLIP does,
Cohere V4 is less documented. **1-day spike** before promising.

UX is harder than the math. "Subtract" is non-obvious in a search box;
LAION's clip-retrieval uses an explicit minus-sign syntax (`snow -skier`).
Could fit naturally into kupua's CQL chip model (`semantic:"snow"
-semantic:"skiers"`) without needing new UI affordances.

Reading: https://github.com/rom1504/clip-retrieval — production
implementation of compositional KNN.

### §3.2 Smart sets / "more from this style" (was #3, #4 in brainstorm)

Average N embeddings (a collection's seed images, or a photographer's
recent work) → KNN against the index. Lightweight, no new infra. Worth
~3 days of work end-to-end. Genuine workflow value when building
themed galleries.

Reading: same Pinterest paper (§1.5) — their "complete the look"
feature is structurally identical.

### §3.3 Outlier detection within a collection (was #5)

Given a Grid collection of M images, compute centroid + per-image
distance, flag the top-3 most distant. Useful for "did we tag the wrong
image into this collection?" Trivial to build (~50 lines).

Reading: any introduction to **Local Outlier Factor** (Breunig et al.
2000). For our scale, plain distance-from-centroid is enough — LOF is
overkill but the paper is the canonical reference.

### §3.4 Time-decay relevance (was #8)

`score = cosine · exp(-Δt/τ)` — "this kind of image, but lately."
A single `script_score` wrapper around the existing KNN query, ~5 lines
of ES JSON. Whether editors want it is the open question, not whether
it's feasible.

### §3.5 Faceted exploration via cluster-as-filter (was #6)

Take a 200-result KNN set, cluster it into 5-8 visual sub-themes,
present each cluster as a filter chip with a thumbnail. Pinterest's
search-result decomposition is the canonical example.

**Half of this is now §1** (auto-categorisation) — assigning
*stable* labels from a vocabulary is more useful than *ephemeral*
per-query clusters. Per-query clustering is mainly interesting for
exploration when no stable labels exist for a given dimension.

Worth revisiting only after §1 has shipped and we see which
result-set decompositions stable labels *don't* cover.

---

## §4 Explicitly Not Pursuing (and Why)

For the record, so they don't keep getting suggested:

- **Query-by-image upload.** Editors don't sit on uploaded JPGs that
  aren't already in Grid; the workflow doesn't exist.
- **"More from this photographer's style" as a feature.** Cute demo,
  no actual workflow asking for it.
- **Semantic deduplication at ingest.** Grid already has version
  detection; embeddings would help catch crops/re-encodings but
  this is an incremental improvement to an existing system, not a
  new feature.
- **Cross-modal caption assistance.** A separate generative tool
  already handles this.
- **Generative anything** (image generation, captioning, style
  transfer). Different problem, different infrastructure, separate
  conversation.

---

## §5 General Reading (Foundation, Not Per-Topic)

The handful of resources that make all of the above easier to think
about:

- **CLIP paper** (Radford et al. 2021) — even though we're using Cohere
  V4 not CLIP, the conceptual framework is identical and CLIP has
  vastly more public documentation. Read this first.
  https://arxiv.org/abs/2103.00020
- **Pinterest visual-search papers** — most production-realistic
  descriptions of an embedding-based image system at scale. Start with
  KDD 2019, follow forward via citations.
- **Vector database vendor blogs** (Pinecone, Weaviate, Qdrant) — full
  of "20 use cases for embeddings" articles. Marketing-flavoured but
  the patterns are real. Pinecone's "Learn" section is the best
  starting point: https://www.pinecone.io/learn/
- **`rom1504/clip-retrieval`** — open-source implementation of most
  of the techniques in this doc, with a hosted demo. Best way to
  build intuition is to play with their UI for 30 minutes.
  https://github.com/rom1504/clip-retrieval
- **MMR original paper** (Carbonell & Goldstein, SIGIR 1998) — for
  when/if we ever do want diversified retrieval. Six pages, still
  the reference.
- **Cohere multimodal cookbook** — the vendor-specific bits we'll
  actually hit in production.
  https://docs.cohere.com/docs/multimodal-embeddings
- **IPTC NewsCodes** — the taxonomies referenced in §1.
  https://iptc.org/standards/newscodes/

---

## §6 What This Doc Is Not

- Not a workplan. No phases, no commitments, no estimates.
- Not exhaustive — only the directions worth my attention right now.
- Not a defence of these ideas against pushback. If shoot grouping or
  auto-categorisation turns out to be a bad fit on closer examination,
  this doc gets a "tried, didn't work" entry, not a rewrite.
