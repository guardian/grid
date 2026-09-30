# AI search preview on zero-result searches (prototype)

## Motivation

When a plain text search returns no results, offer AI search instead. AI search is a nearest-neighbour search, so it always returns results (up to `aiSearchResultLimit`, default 200). Rather than just linking to it, we show a full-width strip of the top AI results under a fade. This makes it clear there is more to see, and the whole box is one link to the real AI search.

## Where the code is

- `kahuna/public/js/search/results.html`: the `ai-search-preview` block in the zero-results section.
- `kahuna/public/js/search/results.js`:
  - `canOfferAiSearch`, the `aiPreview*` flags, and `loadAiSearchPreview()`.
  - `search()` accepts a `useAISearch` override; pass it as the string `'true'`, because `mediaApi` uses `maybeStringToBoolean`.
- `kahuna/public/stylesheets/main.css`: the `.ai-search-prompt` and `.ai-search-preview*` rules.
- `kahuna/public/js/search/query.js`: watches `$stateParams.useAISearch` so the "AI search" checkbox stays in sync when AI search is turned on by a link.

The preview is a still row of thumbnails, cut off at the box's right edge, with a footer that fades into the page.

Gotcha: `kahuna/public/dist/build.js` has been seen stale, so rebuild or run webpack watch if markup or JS changes don't appear.

## Open issue: preview images ≠ first results of the real AI search

The preview requests `length: 12`. For AI search, `length` is effectively `k`: `MediaApi.scala` sets `k = min(length, aiSearchResultLimit)`. `k` sizes the kNN `k`, the lexical query and the rescore window, and `HybridResult.fuseAndRank` normalises scores against the maxima within that candidate pool. So a k=12 search ranks differently from the k=200 search the user lands on.

| Option | Matches the real search? | Cost / trade-offs |
|---|---|---|
| Accept the mismatch (current) | No | Cheapest. The preview is only indicative. |
| Request `aiSearchResultLimit` and slice client-side | Yes | Runs the full AI search (Bedrock embedding plus k=200 hybrid) and downloads about 200 image payloads. Also pass `until: $stateParams.until \|\| null`, otherwise `search()` defaults `until` to `lastSearchFirstResultTime`. |
| media-api change: decouple `k` from `length` (rank with `k = limit`, return only `length` hits) | Yes | Same compute cost as the full search, but a small payload. Needs a server change and a new or changed API param. |
| Reuse the preview's k=200 response when the user clicks through | Yes | Avoids running the search twice, at the cost of client-side caching and router plumbing. |
