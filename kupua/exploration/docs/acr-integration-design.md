# ACR (Adobe Camera Raw) Integration — Design

**Date:** 2026-05-23
**Status:** Design proposal, pre-implementation
**Predecessor research:** [01 Research/grid-versions-infra-audit.md](01%20Research/grid-versions-infra-audit.md)
**Assumed merged:** PR [#4525](https://github.com/guardian/grid/pull/4525) and/or [#4658](https://github.com/guardian/grid/pull/4658) (parent/child relationship display on `GET /images/{id}`).

---

## 1. Goal

Let Kupua editors edit one or many Grid JPEGs in Adobe Camera Raw with a near-invisible filesystem handoff: click in Kupua → ACR opens → edit → click Save → the edited JPEG lands back in Grid as a replacement of the original.

## 2. Framing: editing JPEGs, not raws

Grid does not store raw camera files. Almost every editable image in Grid is already a JPEG (occasionally TIFF). ACR is still useful on JPEGs — white-balance, exposure recovery, curves, lens corrections, crops — but the editorial model shifts:

- The output is conceptually **"the same picture, improved,"** not **"a new variant derived from raw."**
- There is no "open the raw, develop, export" mental step. There's just "open, fix, save."
- This is the single biggest reason the v1 default is **replace** (`replaces-media-id`), not **derivative** (`derivative-of-media-ids`). See §4.

A side-effect of editing JPEGs: ACR's output is a re-encoded JPEG. We pay one quality round-trip per edit. Mitigation: write at quality ≥ 95 from ACR's Save Image dialog (preset in the Bridge startup script). Flagging as an honest cost, not a blocker.

## 3. Scope

### In v1

- macOS-only Swift helper app, distributed via MDM to editor laptops.
- Bridge + ACR as the editing host.
- Single-image and multi-image batch flows (ACR's filmstrip mode).
- Replace semantics: edited JPEG enters Grid as a replacement of the original.
- Auth via short-lived token minted by Kupua and passed in the custom URL scheme.
- No new metadata baked into the JPEG beyond what ACR writes itself.
- **Zero Grid-side changes strictly required.** Kupua queries ES directly and `identifiers.replaces-media-id` is already a dynamically-indexed keyword, so Kupua can filter, sort, and aggregate on it today. Everything in §9 is opportunistic improvement (mostly for kahuna parity), not gating.

### Deferred / post-v1

- Photoshop as an alternative host (§7).
- Explicit ACR XMP sidecar storage in Grid for clean re-edit (§8.4).
- Derivative semantics (`derivative-of-media-ids`) as an editor-selectable alternative to replace.
- Deletion guard on parents with replacements (currently no protection — Grid-proper work).
- Re-applying lost Grid-side edits onto the replacement (Grid-proper work — explicitly not Kupua's problem).

### Explicit non-goals

- Windows support.
- Embedding ACR's UI inside Kupua's browser tab — impossible with public Adobe APIs.
- Building first-class versioning in media-api. The existing `replaces-media-id` rails are sufficient.

---

## 4. Editorial model: replace, not derive

**Decision: ACR edits use `replaces-media-id` on the new image, pointing at the original.**

The original is not deleted. It remains in Grid, gains a `ReplacedUsage` record, and is findable via the back-link and search. The edited JPEG becomes "the current picture" in search results and in any downstream usage. This matches editor mental model in a newsroom: the finished image is the picture; the unedited one is archival.

Trade-offs accepted by picking replace over derivative:

| Concern | Reality |
|---|---|
| "What if I want both versions visible in search?" | Trade-off accepted. If both-visible turns out to matter, switch this flow to derivative or expose it as an editor choice in v1.5. Reversing is a one-line change in the helper's upload payload. |
| "Replacement implies the original is wrong; an ACR edit is more like a polish." | Semantically true. We're using `replaces-media-id` because it best matches the editorial flow ("this is the version to publish"), not because the original is invalid. Worth a brief note in editor-facing docs. |
| "What about chained edits — edit the edit?" | Each new edit's `replaces-media-id` points at the **immediate** parent (the previous edit), not the original raw-ish JPEG. The chain is walkable via the merged PR's `parentAndChildDetails`. Don't try to flatten to root — gives up history. |

**Why not derivative for v1:** derivative semantics create two parallel images in search results for every edit, which clutters the feed exactly as the kahuna-replacement project was created to avoid. Derivative also implies "additive variant," which is the wrong frame when the editor's intent is "use this one instead."

**Why not user-choice at Save-time:** an extra decision the editor has to make on every save, with consequences they may not understand. Pick a default, ship it, revisit if editors complain.

---

## 5. End-to-end flow — single image

```
Kupua (browser)
  │  user selects image, clicks "Edit in ACR"
  │  Kupua mints short-lived token T
  ▼
kupua://edit?token=T&ids=<imageId>
  │  macOS routes URL to registered helper
  ▼
Swift helper (Kupua.app, MDM-distributed)
  │  1. validate T against Kupua's token endpoint
  │  2. resolve image URL via Grid (using T)
  │  3. download original JPEG to
  │     ~/Library/Caches/com.gu.kupua/<sessionId>/in/<imageId>.jpg
  │  4. open localhost WS back to Kupua for progress
  │  5. AppleScript: tell Adobe Bridge to activate,
  │     reveal session/in/, select all, open in Camera Raw
  ▼
Bridge + ACR (filmstrip with one frame)
  │  user edits, clicks "Save Image…"
  │  Bridge startup script pre-pinned:
  │    - destination = session/out/
  │    - format = JPEG
  │    - quality = 95
  │    - preserve metadata = "All"
  ▼
session/out/<imageId>.jpg appears
  │  Swift helper's DispatchSource fires
  ▼
Swift helper
  │  1. show native confirmation:
  │     "Replace original in Grid?  [Review] [Replace] [Cancel]"
  │     (Editor can preview the JPEG via QuickLook before confirming.)
  │  2. on Replace: POST to image-loader's
  │     /enqueueDerivativeImage  (route name is misleading; it is the
  │     general "upload-with-back-reference" endpoint — see §9.3)
  │     with identifiers: { "replaces-media-id": "<imageId>" }
  │  3. report success to Kupua over WS
  │  4. clean session dir on confirmation
  ▼
Grid (via existing image-loader → thrall → ES path)
  │  - new image record created
  │  - identifiers.replaces-media-id = <originalId>
  │  - ReplacedUsage added to original's usages
  │  - parentAndChildDetails on both images updated (merged PR)
  ▼
Kupua refreshes:
  - original now shows "Replaced by <new>" badge
  - new image now shows "Replaces <original>" badge
  - search results show the new image; the old one is reachable via back-link
```

**Approximate steps the editor actually performs:**
1. Click "Edit in ACR" in Kupua.
2. Edit in ACR.
3. Click "Save Image…" → confirm Save dialog.
4. Click "Replace" in the native confirmation.

Steps 3 and 4 could in principle be collapsed, but I'd push back on doing so. The Save dialog is ACR's own UI we can't suppress. The Replace confirmation is a deliberate "are you sure" gate before mutating production Grid — worth keeping.

---

## 6. End-to-end flow — multi-image

Same shape as §5, with the following changes:

- URL: `kupua://edit?token=T&ids=id1,id2,id3` (or for very large batches, the helper exposes a localhost `/manifest` and the URL carries a manifest id — Kupua POSTs the full list first, helper picks it up).
- Helper downloads all N originals in parallel into `session/in/`, reports per-file progress to Kupua via WS.
- Helper waits for either all-downloaded or a threshold (configurable, default: all). Better UX would be to open ACR as soon as the first 3 are present and keep adding to the filmstrip as more arrive — but Bridge doesn't refresh filmstrip on filesystem changes mid-session, so this is "all-or-nothing-then-open" in v1.
- AppleScript: same as §5 — Bridge opens the session/in/ folder, selects all, ⌘R.
- ACR opens with the filmstrip. Editor can use ACR's **Select All** + **Synchronize…** to apply settings across the batch — this is the killer feature that makes Bridge the right host.
- Editor clicks **Save Images…** (note plural — different ACR button when multiple selected). Save preset pre-pinned as in §5.
- Helper's watcher fires per output JPEG. Either upload-as-you-go (default) or batch confirm. v1 default: **single confirmation dialog after all N are written**, listing all N filenames with thumbnails, options Review / Replace All / Replace Selected / Cancel.
- Each upload uses `replaces-media-id: <correspondingOriginalId>` — the helper maintains the input-id → output-filename mapping via the filename, which ACR preserves.

### Concurrency: another `kupua://edit` mid-edit

Queue. The helper shows a native banner: "Batch queued. Will open when current edit finishes." Don't append to in-flight session — too surprising.

---

## 7. Host choice: Bridge primary, Photoshop alternative

**Bridge wins on three counts:** lighter install (any CC subscription), ACR filmstrip with batch Sync makes multi-image genuinely good UX, and the Save Images dialog renders JPEGs without needing Photoshop's full doc model.

**Photoshop alternative (sketch, deferred):** for editors who only have PS and not Bridge, or who want PS's full editing surface (curves layers, retouching, healing brush) beyond what ACR offers, the same Swift helper would route to PS instead. Key differences:

- AppleScript opens the file with `CameraRAWOpenOptions` so the ACR dialog appears first.
- "Done" closes ACR without rendering; "Open" sends to PS. To get a JPEG out we need either ACR's own Save Image button (works in PS-hosted ACR too) or a UXP plugin panel that adds a "Finish & send to Kupua" button that calls Photoshop's export.
- Multi-image is much worse in PS — no filmstrip, edits happen per-document. Effectively single-image only unless we lean on Image Processor scripts.
- UXP plugin requires Adobe Developer Distribution sign-off, or sideload via UXP Developer Tool for internal-only use.

If both hosts ship, the helper detects available apps on launch (`mdfind kMDItemCFBundleIdentifier = "com.adobe.bridge*"` etc.) and prefers Bridge, falling back to PS with a notification. Not v1.

---

## 8. Metadata regime

### 8.1 v1 — do nothing extra

The Swift helper does **not** modify the file before upload. The edited JPEG goes to Grid exactly as ACR wrote it. Editorial / legal metadata that survives the round-trip survives because either:

- ACR preserved it (with **Preserve metadata = "All"** in the Save preset, ACR copies through copyright, byline, caption, keywords, IPTC, EXIF camera data, GPS, the lot — confirmed by Adobe docs and observable in ACR's dialog).
- image-loader will re-extract it from the new JPEG via existing pipelines on upload.

What is **lost** on round-trip:

- **Grid-side userMetadata edits** (label edits, override caption, override byline made in kahuna or Kupua after the original was first uploaded). These live only in Grid's `userMetadata`, not in the file. ACR cannot preserve what was never in the file to start with.
- **Collections, leases, photoshoot membership.** Same reason.
- **Crops on the original.** Geometry doesn't survive an ACR re-encode (and may not even apply if ACR cropped the image).

This loss is true of **any** Grid-image download → edit → re-upload, not specific to ACR. We do not solve it in Kupua. If Grid wants to solve it, that's a Grid-proper enhancement (§9.5), and it lives outside the Kupua scope.

The editor-visible UX consequence: when an edit lands and replaces the original, the new image starts with a clean Grid-side metadata slate (other than what was in the file). The original's userMetadata is still on the original record, reachable via the `replaces-media-id` back-link. We can surface this in Kupua: when viewing a replacement, show a small "View original metadata" affordance that opens the parent's userMetadata read-only.

### 8.2 What we get for free from ACR's `crs:*` tags

ACR writes its full settings recipe into the output JPEG as XMP under the `crs:` namespace (e.g. `crs:Exposure2012`, `crs:Contrast2012`, `crs:WhiteBalance`, `crs:CropTop`, `crs:ProcessVersion`, and ~80 more). image-loader's existing XMP extraction will land these in the new image's `fileMetadata` as dynamic keywords with zero work from us.

This is significant: **the recipe is recoverable from any ACR-edited JPEG in Grid by reading `fileMetadata` back off the image.** v1 doesn't act on this, but it means a v1.5 "re-edit this" feature is implementable purely in the helper (read `fileMetadata.crs:*` off the JPEG, synthesise an XMP sidecar in `session/in/`, hand to ACR) without any Grid changes.

We should probably add a tiny `fileMetadata` filter in Kupua to detect "this image was edited in ACR" by checking for `crs:ProcessVersion` presence, and show a badge. Trivial.

### 8.3 Identifiers written on the new image

Minimum (set by helper at upload):

- `replaces-media-id`: `<originalId>` — the existing key, the existing semantics.

Recommended (small additions, low risk, useful for filtering):

- `edit-tool`: `"acr"` — distinguishes ACR edits from other replacements (Kupua re-uploads, manual replacements, etc.). Lets Kupua show an "Edited in ACR" badge without sniffing fileMetadata.
- `edited-by-kupua-session`: `<sessionId>` — useful for debugging and grouping batch edits in audit logs. Optional.

Both ride the existing `identifiers.*` dynamic mapping — no Grid schema change.

### 8.4 v1.5 sketch: explicit XMP sidecar storage

Not v1. Sketched for the trajectory.

**Problem v1 has:** the `crs:*` route works but is brittle — XMP sometimes gets stripped by intermediary tools, the `crs:` namespace can be re-encoded inconsistently, and parsing 80 fields out of `fileMetadata` to rebuild a sidecar is fiddly. For clean round-trip re-edit, we'd want the sidecar stored separately.

**Sketch:**

- ACR also writes an `.xmp` sidecar to `session/out/` when "Save Image" runs (configurable in Bridge prefs).
- image-loader gains a new optional multipart field: `acr-xmp-sidecar` accepting the raw XMP bytes.
- When present, image-loader uploads it to a sibling S3 key (`<imageBucket>/<imageId>.acr.xmp`) and records `identifiers.acr-xmp-s3-key`.
- media-api gains a `GET /images/{id}/acr-xmp` endpoint that streams the sidecar.
- Kupua's "Re-edit" action downloads the original-of-replacement plus the sidecar, hands both to ACR, ACR opens in prior state.

**Why deferred:** every step except the first is Grid-proper work, and the v1 `crs:*` fallback is good enough to ship without it.

---

## 9. Grid additions on top of merged PRs #4525/#4658

These are listed because they would meaningfully improve the broader Grid UX (mostly kahuna), but **none are strictly required for v1.** Kupua talks to ES directly and already has everything it needs from the existing dynamic `identifiers.*` mapping plus the merged PRs. Sequenced roughly in order of usefulness if anyone picks them up.

### 9.1 Add `replaces-media-id` to `queriableIdentifiers` (kahuna-only)

`derivative-of-media-ids` is in `queriableIdentifiers` but `replaces-media-id` is not (audit Appendix A.9). This affects only **kahuna's** free-text search through media-api — typing the parent ID into kahuna's search box wouldn't find the replacement. Kupua is unaffected (it can query the keyword field directly via ES). One-line config addition in `CommonConfigWithElastic` whenever someone touches the area.

### 9.2 Structured search filter `replacedBy=<id>` / `replaces=<id>` in media-api

Same story as 9.1 — only matters for media-api consumers (kahuna, external API clients). Kupua doesn't need it. Small `QueryBuilder` additions if/when prioritised.

### 9.3 Rename `enqueueDerivativeImage` route, or add an alias

The route name implies derivative semantics but the endpoint is the generic "upload with back-reference" path (it processes whatever identifiers are passed, including `replaces-media-id`). Using it for replacements works today (audit §9.2 confirms) but the name will confuse anyone reading code later.

Either rename to something neutral (`enqueueWithRelationship`?) or add an alias route `enqueueReplacementImage` that wraps it. Cosmetic, but cheap and removes a future trap.

### 9.4 Deletion guard on parents with replacements

Currently, an image with `exports` (crops) cannot be deleted, but an image that has been replaced (i.e. has another image's `replaces-media-id` pointing at it) **can** be deleted, orphaning the replacement's back-link (audit Appendix A.2). With ACR-replace becoming a common flow, this guard is overdue.

Implementation: extend `ImagePersistenceReasons` to include `HasReplacementsPointingAtMe` and `HasDerivativesPointingAtMe`, both queried via a small ES filter on `identifiers.replaces-media-id` / `identifiers.derivative-of-media-ids`. Grid-proper work, not Kupua.

### 9.5 Async perf and `_mget` in `parentAndChildDetails`

PR #4658's async rewrite of #4525 still does N parallel `getImageById` calls to resolve related IDs into `RelationDetail`s. For images with many replacements/derivatives, this is N round-trips. A single `_mget` (Elasticsearch's bulk get) collapses it to one. Probably moot for v1 volumes but a five-line change worth doing while the area is hot.

### 9.6 `RelationDetail.tool: Option[String]`

Extend `RelationDetail` in #4525 with an optional `tool` field, sourced from the related image's `identifiers.edit-tool`. Lets Kupua badge "ACR" vs other replacement sources without a second fetch.

### 9.7 Re-applying lost Grid-side edits to a replacement (Grid-proper, deferred)

**Explicitly not Kupua's problem.** Sketched here only so we don't lose track of it.

The "userMetadata doesn't survive download/edit/upload" issue is real and predates ACR. A Grid-proper fix would be a post-replacement reconciliation step: when image B is uploaded as a replacement of image A, optionally copy A's `userMetadata.metadata` (override caption, byline, etc.), `userMetadata.labels`, `userMetadata.usageRights`, and collection membership onto B, with conflict policy (B wins where it has values, A fills the gaps).

This belongs in image-loader or thrall, gated by an identifier like `inherit-parent-usermetadata: true` that the uploader sets. **Out of scope for Kupua v1.** If it gets built, Kupua just starts setting the identifier — no other change needed on our side.

### 9.8 Kahuna UI: navigable child ID in `DerivativeUsage` rendering

Audit Appendix A.6. Currently rendered as plain text. Trivial fix, would benefit any consumer of kahuna (including a Kupua user who falls back to kahuna for any reason).

---

## 10. macOS glue — implementation outline

### 10.1 Components

| Component | Form | Approx LoC |
|---|---|---|
| Swift helper app (`Kupua.app`) | SwiftUI menu-bar app, registered for `kupua://` | ~500–1000 |
| Bridge startup script | `.jsx` installed to `~/Library/Application Support/Adobe/Bridge 2026/Startup Scripts/` | ~100 |
| Save Images preset | JSON written to Bridge's ACR settings on first launch | ~30 |

### 10.2 Swift helper responsibilities

- Register `kupua://` URL scheme via `Info.plist`.
- Handle multiple URLs (queue if busy).
- Validate tokens against Kupua's `/api/acr-token/validate` endpoint.
- Download images via authenticated HTTPS to per-session temp dirs under `~/Library/Caches/com.gu.kupua/`.
- AppleScript out to Bridge (`tell application "Adobe Bridge" to activate; tell application "Adobe Bridge" to reveal POSIX file "..."` etc.).
- Watch `session/out/` via `DispatchSource.makeFileSystemObjectSource`.
- Show native confirmation dialogs via `NSAlert` with embedded preview.
- Stream progress to Kupua over a localhost WebSocket (the helper itself listens on a random port and tells Kupua via a small reply to the URL — or, simpler, Kupua polls a `kupua://status` URL the helper handles).
- POST uploads to image-loader's `/enqueueDerivativeImage` (or successor route per §9.3) with `replaces-media-id` identifier.
- Clean session dirs on success or explicit cancel; retain on failure for debugging.
- Sentry / structured logging to a known location for diagnostics.

### 10.3 Bridge startup script responsibilities

- Pin ACR's Save Image destination to the current session's `out/` dir (read from a marker file the helper drops alongside the input images).
- Pin format to JPEG, quality 95, metadata "All".
- Optionally: install a custom Bridge menu item "Send to Kupua" that triggers the helper's upload directly without waiting for the file watcher (snappier UX but more moving parts — file watcher is good enough for v1).

### 10.4 Auth: token primary, alternatives mentioned

**v1 chosen path: short-lived (5 min, single-use) token minted by Kupua, passed in the URL scheme as `?token=…`.** Helper exchanges the token at Kupua's `/api/acr-token/validate` for a longer-lived (1 hour) bearer to use against Grid. Token covers download permissions for the listed image IDs only and upload permissions for replacements of those IDs only — least privilege.

**Alternatives considered, not chosen:**

- **Reuse panda cookie:** ugly, requires the editor to copy a cookie value or for the helper to read the browser's cookie jar (sandbox-hostile on macOS). Rejected.
- **Full OIDC/SSO in the helper:** needs an embedded webview for the auth flow, much heavier. Worth it only if the helper grows beyond ACR-glue duties. Defer.
- **Long-lived API key per editor:** simple but creates an unrevocable credential on every editor laptop, which is a real security regression. Rejected.

### 10.5 Distribution

Helper distributed via the Guardian's MDM (Jamf or whatever's current). Adobe Bridge already in the standard editor laptop image; nothing new required there. Helper signed with the Guardian's Developer ID, notarised via Apple, stapled. First-launch flow: prompt user to grant URL scheme registration (one click in System Settings), test by clicking a "Verify install" link in Kupua.

The Bridge startup script is dropped into the user's Bridge scripts folder by the helper on first launch (helper detects Bridge install location, copies the `.jsx`). Bridge picks it up on next launch.

---

## 11. Kupua surface

### 11.1 New affordances

- **"Edit in ACR" button** on a single image's detail view. Disabled if the editor lacks an editing-permitted permission, or if the file is not a format ACR accepts (rare in practice — ACR opens JPEG/TIFF/PSD/DNG and most raws).
- **"Edit N in ACR" action** in the multi-select toolbar when more than one image is selected.
- **"ACR" badge** on images that have `identifiers.edit-tool = "acr"` (or, fallback, `fileMetadata.crs:ProcessVersion` present).
- **"Replaces / Replaced by" versions panel** in the image detail right-hand pane. Sourced from `parentAndChildDetails` (merged PR), shows thumbnails with click-to-navigate. For a chain of edits, the panel shows the entire chain in order, current at the top.
- **"View original metadata" affordance** when viewing a replacement — surfaces the parent's `userMetadata` so the editor can see what's been lost in the round-trip (§8.1).

### 11.2 Progress UX during edit

While ACR is open and the helper is awaiting Save:

- Kupua shows a non-blocking banner at the top of the relevant image(s): "Editing in ACR — N file(s) downloaded, awaiting save."
- Kupua does **not** block other interactions. Editor can browse Grid, make selections, even open another image — the in-progress edit just sits until ACR closes or saves.
- If the user closes ACR without saving, helper detects no file in `session/out/`, dismisses the banner, cleans the session dir.

### 11.3 Failure modes the UI must handle

| Failure | UX |
|---|---|
| Helper not installed | "Edit in ACR" button shows an "Install required" tooltip; click opens an install-instructions modal. |
| Bridge not installed | Helper returns error via WS; banner shows "Adobe Bridge not found." |
| Download fails | Helper reports failure; banner shows error with retry. |
| ACR crashes mid-edit | File watcher never fires; helper times out after configurable window (default: 4 hours), prompts user via notification. |
| Upload fails | Helper retains the edited JPEG in session/out/; UI shows "Upload failed — [Retry] [Save to Disk]." Don't lose editor work. |
| Editor cancels at native confirmation | Session dir retained for 24h then cleaned, in case of accidental cancel. |

---

## 12. Failure modes & edge cases (system-level)

1. **Two editors edit the same image simultaneously.** Both produce replacements. The second to upload wins as "current"; the first becomes a chained predecessor. Acceptable. Surface "X is also editing this image" in Kupua if the in-progress edit is visible via WS presence — out of scope for v1.

2. **An image is deleted in Grid while the editor has it open in ACR.** Helper detects on upload (404 from image-loader's lookup of the parent ID) and reports to UI: "Original deleted; edit saved to ~/Downloads as fallback."

3. **Session dir disk full / OS clears caches.** Helper checks free disk before download (`statfs`); cancels with clear error if < 2× total expected payload.

4. **URL scheme hijacked by a third party.** Token validation against Kupua's endpoint is mandatory before any download. Token covers only the listed IDs. Worst case: a malicious URL with valid IDs but stolen token triggers a download to disk — bad, but token is single-use and 5 min, blast radius is small.

5. **ACR Save quality changed by editor in the dialog.** Helper can't prevent. We accept whatever ACR writes. The 95-quality preset is a default, not a lock.

---

## 13. Open questions (for review before implementation kicks off)

1. **Helper distribution timing.** MDM rollout has lead time. Can v1 ship to a small pilot group via direct download while MDM is being arranged?
2. **Format filter for "Edit in ACR" button.** What's the precise allow-list? JPEG and TIFF certainly. PNG? PSD? Bridge will refuse some; we should refuse client-side first.
3. **Replacement-chain depth limit.** Should we cap the number of edits in a chain (e.g. > 10 starts to feel like noise)? Or unbounded?
4. **Editor identity on `addedBy`.** When the Swift helper uploads, who is the `uploadedBy`? The token resolves to the editor; `addedBy` should reflect that. Confirm Grid records the token-bearer as uploader, not "kupua-helper".
5. **Token revocation.** If an editor leaves mid-edit (laptop closes, cancels in Kupua), can Kupua actively revoke the outstanding token, or do we just wait for the 5-min TTL?
6. **Bridge version lock.** Which Bridge major version do we test against and pin? Adobe ships breaking ExtendScript changes occasionally; we should declare a supported range.
7. **Audit logging.** Where do ACR edit events get logged for editorial audit? Just normal Grid upload logs, or do we want a dedicated "edit history" log?

---

## 14. What's deliberately not in this doc

- Concrete Swift code or AppleScript snippets. Implementation detail, belongs in PR descriptions.
- ExtendScript syntax for the Bridge startup script. Same reason.
- Sequence diagrams for every failure mode. The text in §11.3 / §12 is sufficient to drive implementation.
- Exact JSON payload shape for the token validation endpoint. Belongs in a follow-up API spec doc.
- UI mocks for the Kupua affordances. Worth doing separately, but design-doc-as-text is the right starting point.

---

## 15. Decision summary

| Decision | Choice | Rationale ref |
|---|---|---|
| Host | Bridge | §7 |
| Relationship semantics | Replace | §4 |
| Auth | Short-lived token in URL scheme | §10.4 |
| File-metadata bake by helper | None in v1 | §8.1 |
| XMP sidecar storage | Deferred to v1.5 | §8.4 |
| Strictly required Grid changes | None (Kupua queries ES directly) | §9 |
| Photoshop | Mentioned, deferred | §7 |
| Distribution | MDM, signed + notarised | §10.5 |
| Multi-image | Single batch confirm, replace-all-or-selected | §6 |
