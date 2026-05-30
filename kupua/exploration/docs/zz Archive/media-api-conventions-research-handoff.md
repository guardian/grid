# Handoff: media-api Conventions Research

**For:** Sonnet High (single session, ~2h budget)
**Mode:** Research only. No code changes. No commits. No PRs.
**Deliverables:** Two files in `kupua/exploration/docs/03 Ce n'est pas une pipe dream/`:
  1. `media-api-conventions.md` — full reference (long, detailed)
  2. `media-api-instructions-for-agents.md` — distilled rules (≤80 lines)

---

## 0 — Context

I'm planning to add ~14 new endpoints to Grid's `media-api/` to support kupua. Background:
`media-api-gap-closure-feasibility.md` (what the endpoints are) and
`media-api-gap-closure-worknotes.md` (how we're sequencing the work) in the same folder.

I am not a Scala engineer. Implementing agents will be Sonnet High. Reviewers will be
the Grid team (humans). PR 1 should land looking like it was written by someone who
has been on the team for years — substance feedback only, no style nitpicks.

That's what this session produces: the conventions doc + a short rules file that
implementing agents read before writing any media-api code.

---

## 1 — Sources, in order of priority

### Primary: the codebase itself

`media-api/`, `common-lib/`, plus selectively `thrall/`, `cropper/`, `metadata-editor/`,
`leases/`, `collections/`, `usage/` (sibling services that share the Argo / elastic4s /
Play patterns).

Whatever the org-wide style guide says, **the code in this repo is the ground truth.**
Where the code disagrees with org guides, the code wins. Where the code disagrees
with *recent paired PRs by the two named engineers*, the PRs win (they reflect
current practice; the code may have old patterns nobody's updated). Note disagreements
so I can ask the team.

**Priority order: code > recent paired PRs (andrew-nowak ↔ twrichards) > org guides.**

### Secondary: PRs from two engineers known for good media-api practice

Two Grid engineers whose work is considered exemplary: `andrew-nowak` and `twrichards`.
Their PRs are the best signal of *current* media-api practice — better than org-wide
guides (which may be aspirational or stale).

**Trawl strategy:** filter aggressively. Most-comments-first surfaces the substantive
discussions, not dependency bumps.

Start with PRs where they paired (one author, the other reviewing — these are the
richest discussions):

- https://github.com/guardian/grid/issues?q=is%3Apr+state%3Aclosed+author%3Atwrichards+commenter%3Aandrew-nowak+sort%3Acomments-desc
- https://github.com/guardian/grid/issues?q=is%3Apr+state%3Aclosed+author%3Aandrew-nowak+commenter%3Atwrichards+sort%3Acomments-desc

Known-good examples to read fully (the user pre-selected these):

- https://github.com/guardian/grid/pull/4122
- https://github.com/guardian/grid/pull/4201
- https://github.com/guardian/grid/pull/3998
- https://github.com/guardian/grid/pull/4145
- https://github.com/guardian/grid/pull/4334

Then skim the top **~15 paired PRs** sorted by comment count. **Explicitly skip:**

- Scala Steward / dependency-bump PRs (one-line version bumps, no discussion)
- Pure formatting / scalafmt PRs
- PRs not touching `media-api/` or `common-lib/`

For each PR you do read, look for:

- PR description style (narrative density, screenshots, test evidence)
- Commit count and message style
- **Review comment patterns** — what reviewers actually flag (style? logic? tests?
  naming?). This is the most valuable signal of all.
- Size — what's a typical "small enough" PR in lines/files
- Controllers / endpoints added — copy those patterns directly

Cite PR URLs in your notes for every pattern derived from a PR.

### Tertiary: Guardian org-wide guides (skim, ~10 min)

- https://github.com/guardian/recommendations/blob/main/pull-requests.md
- https://github.com/guardian/recommendations/blob/main/scala.md

Key points (already summarised so you don't have to re-derive):

- PRs: small, single-concern, releasable, descriptive, narrative commits.
- Reviewers prefix nits clearly ("optional:", "nitpick:", "required:", "question:").
- Scala: prefer immutability; prefer dependency-as-function-parameter over DI frameworks;
  Play apps use **compile-time DI** (not Guice runtime DI); LTS Scala + Java 21+.
- Scalafix/scalafmt do mechanical style — don't write rules ScalaFmt enforces.

**These guides are aspirational and may be stale.** If they conflict with what the
code or recent paired PRs show, the code and PRs win. Note conflicts in the "Questions
for the team" section.

---

## 2 — What to extract from the code

Read enough of each topic to write a concrete description. Cite file:line for every
pattern you describe. Where multiple patterns exist (old vs new), name both and flag
which looks current.

1. **Controller anatomy.** Pick one well-written recent controller in media-api (e.g.
   `MediaApi.scala`) and walk through a single endpoint as the canonical example.
   Cover: route definition → controller method → auth → param parsing → ES call →
   response construction → error handling.

2. **Route definitions** (`conf/routes`). Ordering rules, path conventions
   (`/images/:id` vs `/images/search-after`), POST vs GET conventions for read-only
   endpoints with body params.

3. **Argo response patterns.** When `respond` vs `respondCollection` vs `respondError`.
   When to populate `links` and `actions`. Are there endpoints that return a bare
   scalar in `data`? What does the Grid team consider the minimum Argo envelope?

4. **Image enrichment.** How `imageResponse.create(...)` is called from existing
   endpoints. What params it needs. Where the permission booleans come from.

5. **elastic4s usage.** Import style, request construction idiom, response extraction.
   Look at `ElasticSearch.scala` and note: do they use the DSL fluent style or
   explicit case classes? How are async results handled (`Future`, `EitherT`)?
   Where are timeouts set?

6. **Permission / auth.** `auth.async` vs other variants. Where permission checks
   happen (in controller? in a helper?). How `isUploaderOrHasPermission` is typically
   used. What "Internal tier" filtering looks like.

7. **Error handling.** Existing `errorKey` strings (enumerate the common ones).
   Status code conventions (404 vs 405 vs 403). How errors propagate from
   ES layer → controller.

8. **Test conventions.** Location (`media-api/test/`?), framework (PlaySpec?
   ScalaTest? Specs2?), mocking style (mockito? hand-rolled?), what's mocked vs
   real (ES via testcontainers? in-memory?). Naming conventions for test files
   and test methods. Coverage expectations.

9. **Comment density.** Run `grep -c '^\s*//' media-api/app/**/*.scala` for a sample
   of files; report average comments-per-100-LOC. Note WHEN comments appear (above
   complex algorithms? above public methods? above non-obvious workarounds?). Note
   what's absent (rarely any Scaladoc on private methods? no `/** */` blocks?).

10. **Logging.** Which logger import. Structured fields vs string interpolation.
    Log levels — what's `info` vs `debug` vs `warn`? Are there metric/monitoring
    calls intermixed with logging?

11. **Imports & formatting.** Is there a `.scalafmt.conf`? Read it. Import ordering
    conventions (grouped? sorted?). Line length. Whether wildcard imports are used.

12. **Naming.** Method naming (camelCase, verb-prefix?). Case class naming for
    request/response bodies. Whether ES-query-related types live in `Model` files
    or alongside controllers.

13. **Anti-patterns to avoid.** Code in the repo that looks deprecated, ancient
    Scala 2.10-style, or actively warned against in the org-wide guide. New
    endpoints should not copy these.

14. **Open questions.** Things the code cannot answer. Examples: "is there a hidden
    style guide?", "do reviewers prefer fluent elastic4s DSL or explicit builders?",
    "what's the testing bar for a new read-only endpoint vs a write endpoint?".

---

## 3 — Deliverable 1: `media-api-conventions.md`

Full reference. Long is fine. Use the 14 topics above as sections. Each section:

- Description of the pattern, with cited file:line examples.
- A canonical short code snippet (~5-15 lines) showing the pattern.
- Variations observed, with judgment about which to prefer (and why).
- Anti-pattern callout if relevant.

End with:

- **"Patterns I'm uncertain about" section.** Be explicit. Things you saw that might
  be current best practice or might be old code nobody's updated. Don't pretend to
  certainty you don't have.
- **"Questions for the team" section.** Specific questions whose answers would unblock
  the implementing agents. Aim for 5-10 questions, not 30.

---

## 4 — Deliverable 2: `media-api-instructions-for-agents.md`

Short. Maximum 80 lines. This file is loaded into every implementing agent's context.

Format: numbered rules with one-line rationale each. Examples of the shape:

- "All new controllers extend `BaseController` and use `auth.async { ... }` for
  authenticated routes. Cite: `MediaApi.scala:Lxx`."
- "Endpoints returning images call `imageResponse.create(id, image, perms..., tier)` —
  never construct image JSON manually."
- "Comments: only when explaining non-obvious *why*. Codebase average is N per 100 LOC."
- "Tests: PlaySpec, in `media-api/test/controllers/`, mirror controller package."
- "Logging: `MarkerLoggerFactory.getLogger`, structured fields, never string interp."
- "Errors: return `respondError(status, errorKey, message)` — see `ArgoHelpers`."

**Skip rules that ScalaFmt/Scalafix enforce.** No formatting rules.

**Skip rules that don't apply to new read-only endpoints.** No need to document
write-path lease/edit conventions if the agent isn't touching those.

---

## 5 — What this session is NOT

- Not implementing any gap.
- Not editing any source files (Scala or TS).
- Not commenting on the feasibility doc or workplan structure.
- Not making PRs or commits.
- Not running tests (you can run `grep`, `find`, `wc -l` for measuring conventions —
  but no `sbt`).

---

## 6 — Pushback clause

If, while reading the codebase, you conclude that:

- media-api has so much internal inconsistency that "the conventions" is not a
  coherent thing to extract, OR
- the two referenced engineers' PRs reveal patterns the rest of the codebase doesn't
  follow, OR
- the right answer is to ask the Grid team for a style guide instead of deriving one

…then stop, write a Section 0 in the conventions doc explaining the issue, and
hand back. Don't fabricate consistency that isn't there.

---

## 7 — Done when

- Both files exist in the target folder.
- `media-api-conventions.md` cites file:line for every concrete pattern.
- `media-api-instructions-for-agents.md` is ≤80 lines, no formatting rules,
  references the conventions doc for detail.
- "Questions for the team" section has 5-10 specific questions.
- I can hand the instructions file to an implementing agent without further editing.
