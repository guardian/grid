# Comparing relevance across hybrid searches

## Decision

Expose `actions.maxSemanticSimilarity` on text AI search responses: the maximum
**raw cosine similarity among the returned images with usable embeddings**.
The range is [-1, 1], higher is better, and the field is omitted when no returned
image has a usable similarity. Ranking, result counts, and filtering are unchanged.

This is a cross-query **semantic diagnostic**, not a calibrated hybrid relevance
score or a probability. It is useful for eyeballing searches and investigating a
semantic cutoff. A low value alone cannot establish that every hybrid result is
irrelevant: a useful lexical match can have low semantic similarity.

We deliberately avoid a generic `maxScore` name. The current fused score is useful
for ordering results within one search, but its maximum cannot answer the proposed
cross-search question. A genuinely calibrated hybrid cutoff requires relevance
judgements that we do not yet have.

## Why the fused maximum is misleading

For query $q$ and image $d$, let $b(q,d)$ be its BM25 score and $c(q,d)$ its cosine
similarity. Let $C_q$ be the union of lexical and semantic candidates, and define:

$$
B_q = \max_{d \in C_q} b(q,d), \qquad
C_q^{\max} = \max_{d \in C_q} c(q,d).
$$

For semantic weight $w$, the current ranking score is:

$$
F(q,d) = (1-w)\frac{b(q,d)}{B_q}
       + w\frac{c(q,d)+1}{C_q^{\max}+1}.
$$

The implementation gives a component zero when its denominator is zero.
Its missing-semantic-signal fallback is -1; that fallback is for ranking only.

Both components otherwise give their own best candidate a value of 1, regardless
of absolute strength. If the same image leads both components, $\max F=1$ whether
its raw scores are $(b,c)=(0.2,0.1)$ or $(20,0.8)$. Even a single weak candidate
will get a fused score of 1 if both denominators are nonzero.

More generally, with both components available and $0 \leq w \leq 1$:

$$
\max(w,1-w) \leq \max_{d \in C_q} F(q,d) \leq 1.
$$

The lower bound follows by evaluating the fused score at each component's winner;
the other component is nonnegative. At the default $w=0.85$, the maximum is therefore
at least 0.85 even for a poor search. This maximum mainly describes how the two
rankings agree at the top, not whether the best result is useful.

Multiplying every BM25 score for a query by any positive constant also leaves the
normalised lexical scores unchanged. Thus the fused scores have discarded
information; there is no universal inverse transformation that recovers relevance
from the fused maximum alone.

## Why not just bound BM25?

A simplified BM25 contribution for term $t$ is:

$$
\operatorname{IDF}(t)
\frac{f(t,d)(k_1+1)}
     {f(t,d)+k_1(1-b+b|d|/\operatorname{avgdl})}.
$$

There is no single query-independent BM25 ceiling suitable for this API. Its scale
depends on term rarity, query length, field boosts, corpus statistics and query
construction. Strictly, the term-frequency factor *does* saturate: for a fixed
simple query, a bound can be constructed from its IDFs and $k_1+1$. That is not the
same as a universal relevance scale. Our multi-field query also requires accounting
for its field combination and boosts.

Dividing by a query-specific theoretical bound would measure the fraction of
potential lexical score attained, not relevance. A rare accidental match can attain
a high fraction, while a useful match to part of a long query can attain a low one.

A fixed saturating transform, such as

$$
L_\tau(b)=\frac{b}{b+\tau}, \qquad \tau>0,
$$

would avoid dependence on the current result set, but choosing $\tau$ arbitrarily
does not remove query-length or IDF effects. A number in [0, 1] is not automatically
comparable as relevance. Mixing it with cosine would create a new heuristic scale
and an arbitrary cutoff, so this change does not do that.

## The diagnostic

For a query embedding $u_q$ and image embedding $v_d$, compute:

$$
c(q,d)=\frac{u_q\cdot v_d}{\lVert u_q\rVert\lVert v_d\rVert}.
$$

By Cauchy-Schwarz, $-1 \leq c(q,d) \leq 1$. We use the actual norms: stored image
vectors are truncated 256-dimensional versions of normalised 1536-dimensional
vectors, so their magnitudes need not be 1. A dot product alone would be incorrect.

Let $R_q$ be the final returned top-k images, and $V_q$ the subset with usable
embeddings. The API reports:

$$
S(q)=\max_{d\in V_q}c(q,d).
$$

Unlike the fused maximum, the value for a particular query-image pair does not
depend on any other candidates or BM25 scores. A weak search with a best cosine of
0.1 reports 0.1; one with a best cosine of 0.8 reports 0.8. Adding an image with
lower similarity cannot rescale the existing maximum. Changing the returned set
can, of course, change which image supplies the maximum.

We ignore missing embeddings, dimension mismatches, zero-magnitude vectors and
non-finite cosine values. Finite values are clamped to [-1, 1] to remove floating
point overshoot. A genuine cosine of -1 is valid; absence of evidence is not -1.
When $V_q$ is empty, $S(q)$ is undefined and the field is omitted, not set to zero.

If a [0, 1] display is preferred, $(S+1)/2$ is a fixed affine transformation and
retains the same information. It is still not a probability, and orthogonal vectors
would display as 0.5. Raw cosine avoids that potentially misleading presentation.

## API and UI contract

An example response fragment is:

```json
{
  "actions": {
    "tickerCounts": {},
    "maxSemanticSimilarity": 0.6342
  }
}
```

- The field uses the existing search-metadata `actions` envelope because the
  Theseus client restricts top-level response keys.
- It is computed for text AI searches, including the `vecWeight=0` and
  `vecWeight=1` short-circuits. At weight zero it still measures semantic similarity,
  but only among the lexical results that were returned.
- It describes the final returned set, not all retrieved candidates, the entire
  filtered pool, or necessarily the first-ranked image. A semantic candidate with
  cosine 1 can be dropped by fusion; if the best surviving cosine is 0.8, we report 0.8.
- It is omitted for empty or entirely unscorable results. Ordinary lexical search,
  filters-only AI search, and similar-image search do not acquire this diagnostic
  in this change. Do not interpret absence as low relevance.
- The computation uses embeddings already loaded for the returned images. It adds
  no Elasticsearch or embedding-service requests, only an $O(kD)$ local pass for
  embedding dimension $D$.

The AI search results summary displays **Max semantic similarity** beside the
result count, formatted to three decimal places. The results controller reads it
alongside the existing ticker counts:

```javascript
const maximum = images.$response?.$$state?.value?.actions?.maxSemanticSimilarity;
```

The display is hidden when the field is absent. An explicit presence check keeps
zero and negative scores visible, and each response replaces the previous value
so it cannot persist into a search without the field. The API retains full
precision for recording or threshold experiments.

## What comparisons mean

The geometric scale is fixed across queries using the same embedding model,
dimensions and preprocessing. It is **not calibrated across query intents**:
proper names, exact metadata requests, abstract concepts and visible objects can
have different score distributions. Embedding anisotropy also means that zero
cosine is not an empirically established relevance boundary.

Hold model/version, dimensions, retrieval settings, filters and semantic weight
steady when collecting an initial comparison set. Record those settings with the
score and query. Changing weight affects result membership even though it does not
enter the cosine formula. Approximate KNN can miss a stronger match; this is a
maximum over returned images, not a guarantee about the collection.

Maxima also depend on the size of the search pool. As an illustrative model, if
$n$ irrelevant similarities were independent with cumulative distribution $G$, then

$$
\Pr(\max c_i\leq t)=G(t)^n.
$$

Larger pools offer more opportunities for a high accidental similarity. Real image
results are correlated and selected, so this is not a formula for calibrating our
API; it explains why a fixed geometric scale alone does not guarantee an equally
reliable cutoff in differently sized or filtered collections.

## Learning a cutoff

1. Collect diverse queries, their returned images, the diagnostic and retrieval
   settings. Include poor searches, names, exact metadata queries and filtered searches.
2. Judge whether each search has *any* useful result, and separately judge individual
   images if the eventual goal is to trim the tail of a result list.
3. Sweep candidate thresholds on a development set and measure useful searches
   incorrectly rejected as well as irrelevant searches correctly rejected. Validate
   the chosen operating point on held-out queries, broken down by query type.
4. Initially use a low score as a diagnostic or warning, not an automatic hard filter.
   Explicitly examine lexical matches below the proposed semantic threshold.

For scored returned images, $S(q)<t$ implies every measured cosine is below $t$.
It says nothing about unscorable images or lexical relevance. Conversely, $S(q)\geq t$
only establishes that *one* image reaches the semantic threshold; the remaining
results can still be irrelevant. A maximum cannot determine where to cut off the
tail, and hybrid ordering need not be monotonic in cosine. That experiment needs
per-image scores and judgements, not this search-level field alone.

For a true hybrid relevance score, a later supervised calibrator could estimate
$P(\text{relevant}\mid c,\log(1+b),\text{query features},\text{missing signal flags})$,
including query length and lexical statistics where useful. Fit and calibrate it
on representative judgements, validate by held-out query rather than random image
pairs, and re-evaluate after model or corpus changes. Neither the existing fusion
weight nor the BM25 saturation constant substitutes for that evidence.

## Verification

Unit tests cover fixed-scale values across queries, invariance to lower-scoring
companions, missing and invalid embeddings, genuine negative cosine and JSON field
omission. Elasticsearch integration tests cover hybrid fusion, both endpoint weights,
an empty filtered set and a top-k result set whose maximum is below the candidate
maximum. Existing ranking expectations are retained.

```sh
sbt 'media-api/testOnly lib.elasticsearch.HybridResultTest controllers.MediaApiTest lib.elasticsearch.HybridSearchTest'
```

The fusion method is described in
[An Analysis of Fusion Functions for Hybrid Retrieval](https://arxiv.org/abs/2210.11934).
Its use for ranking does not imply a cross-query relevance calibration.