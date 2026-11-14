# Editing UI Decisions and Deferred Badge Design

**Implemented UI decisions, updated 12 November 2026.** The operator selected always-inline
pills, rejecting the extra field-task entry as unfamiliar and too tap-heavy for
browsing. Expanded [Step 7](gradually-growing-teeth.kupua-edits-steps.md#step-7-finish-labels-archive-and-collection-addition)
now includes the actual single/multi metadata UI: connected Labels are preserved;
new scalar, location, people, keyword, photoshoot and collection actions explicitly
prepare not-sent intents only. This borrows presentation work from Steps 8, 12 and 16;
it does not complete their commands or the original archive/collection scope of Step 7.
No new services, dependencies, real writes or badge-policy changes are included.

## 1. Recommendation

**Keep browsing image-first, with immediately usable pills inside the existing
metadata surface. No extra pencil or editing mode for pill fields.**

Use approximately 36px touch controls. Add is an icon in the field heading: the
existing boxed plus on desktop, a plus in a dashed circle on touch. Pills sit below
that heading. Refine keeps its own Add filter treatment. Suggestions overlay
neighboring content at nearly the available panel/card width rather than move it. Collection/status
presentation and metadata editing remain distinct interactions:

- Result badges answer what an image belongs to or what needs attention.
- Metadata values support inspection and searching.
- Explicit commands change a captured set of images.

Preserve separate searchable value text and explicit add/remove/apply controls.
Text replacements still need deliberate submission; Refine remains live search.

## 2. What Already Exists

| Surface | Current Behavior | Consequence |
|---|---|---|
| Refine | Compact search keeps free text in the bar; structured clauses move to wrapping chips, field picking and a replacement value editor inside the sheet. Changes apply live; Show results closes it. | Reuse task decomposition, not its live-search submission semantics for writes. |
| Metadata sheets | Selection has a peek/expanded sheet with scrim; detail has an image-first, nonmodal metadata sheet. | A natural editing hub already exists. Do not add an unrelated floating editor over it. |
| Labels | Search text and add/remove/apply-to-all are separate controls; drafts and receipts have an owner outside selection. Entry uses a full-width input with actions below. | Preserve intent and target ownership when connecting other field families. |
| Metadata presentation | Kahuna-aligned order, Unknown/mixed wording and viewer visibility; Source/configured aliases in Additional metadata, technical dimensions/file size with Original in the crop rail. | Detail/search-panel familiarity takes priority over retaining the previous shared table column order. |
| Metadata authority | Ordinary API editors use per-image edits capability; an open draft remains mounted but cannot prepare when authority is withheld. Multi-image preparation requires complete captured targets. | Do not infer authority from field configuration or discard drafts on temporary withholding; Labels retains its separate execution owner. |
| Table Collections | Optional, default-hidden registry column already exists; currently renders neutral path-ID pills. | This is not a missing field. Improve readability/discoverability rather than inventing another column. |
| Standard Grid | Collection leaf-name badges with colours/path hover, labels, dates and separate status indicators. | Already has collection presentation, but its clipped strip needs an overflow policy. |
| Justified / small Grid | Image-only densities omit most informational content; selection/safety presentation remains. | Adding badges changes a deliberate density tradeoff. Keep geometry and zoom continuity stable. |

Sources: [SearchBar](../../src/components/SearchBar.tsx#L91),
[RefineChips](../../src/components/RefineChips.tsx#L35),
[FiltersSheet](../../src/components/FiltersSheet.tsx#L104),
[panel ownership](../../src/components/PanelLayout.tsx#L286),
[detail sheet](../../src/components/ImageDetail.tsx#L778),
[label controls](../../src/components/LabelEditor.tsx#L116),
[Table Collections](../../src/lib/field-registry.tsx#L769),
[Grid badges](../../src/components/ImageGrid.tsx#L415),
[zoom ladder](../../src/lib/results-zoom.ts#L64).

## 3. Collection and Status Badge Policy

**Recommendation: vary the information budget with actual tile space, not just
the view name.** Do not add a preference switch for every badge or shrink text
until every label fits.

| Available Space | Proposed Presentation |
|---|---|
| Smallest image-only thumbnails | No textual pill strip. Use a compact collection-membership indicator/count if it remains legible without competing with selection and safety controls; otherwise rely on the metadata surface. Never claim an indicator identifies a collection whose name cannot be read. |
| Medium thumbnails | One short collection label with an explicit overflow count; one compact exceptional-status signal where needed. Full paths and remaining memberships belong in metadata. |
| Large thumbnails | A bounded collection strip with overflow, useful crop/use/status information and existing selection affordances. Labels need not compete equally with collections on every image. |
| Table | Yes to Collections as an ordinary optional column. Prefer readable names, with full-path disambiguation available; do not mistake two identical leaf names for the same canonical collection. Keep canonical identity in search/data. |

For **Justified**, try a restrained overlay before adding variable-height caption
bands. An overlay preserves the packed boxes, but can obscure image content;
compare that cost explicitly. A caption band is not free: it changes the layout
and position-preservation problem. No geometry/render change or performance
campaign is commissioned here.

For the first comparison, add collection membership plus a compact exceptional
use-status signal and crop-existence marker where they fit. Do not add the whole
label list, dates and every usage/syndication icon to every Justified tile. This
is a proposed priority order, not a new interpretation of server permissions.

Priority is not a long icon row: preserve selection and graphic-image safeguards;
surface exceptional use restrictions without implying that absence means permission;
show useful collection membership; then consider crop/usage details as space allows.
Do not copy every configured Kahuna badge into every density.

On **mobile thumbnails**, prefer informational badges rather than tiny search/edit
targets: image activation keeps its existing meaning, and long press keeps selection.
This would change existing mobile badge-tap shortcuts and needs operator acceptance.
Full metadata offers larger value-search and edit controls. Desktop can retain its
compact search links. Badge overflow must not introduce invisible tiny tap zones.

Table cell searching currently depends on modifiers and is suppressed in selection
mode; colouring its pills alone does not solve touch interaction. Do not introduce
inline Table editing accidentally while improving collection display.
[Table activation](../../src/components/ImageTable.tsx#L1085),
[Table cell renderer](../../src/components/TableRowCells.tsx#L24).

## 4. Mobile Editing: Always-Inline Pills

### Labels and Keywords

Expand Selection details and use the existing pill actions immediately. Value text
searches; the attached close removes; partial values also offer Apply to all.
Add opens an input in that field. The header action stays separate from the values;
text-field pencils belong to the same header, with desktop-only circular hover.
There is no Edit Labels entry, field-task screen,
sheet-wide edit mode, accumulated review basket or Save-all transaction.

The app uses `--mobile-edit-control-size: 36px` as one tuning value for touch
controls. This is an iteration choice, not a claim of real-phone usability approval.
Shared editable pill targets use it; ordinary unrelated controls retain their sizing.
Long values wrap and the drawer scrolls. There is no separate Read only switch;
the existing Hi, Joshua startup preference is unchanged.

### Title, Description and Credit

Text fields retain a pencil to replace their reading row with an inline input or
textarea. Shared content is prefilled; mixed content is explicitly labeled in the
reading state and uses field-specific italic overwrite placeholders in text editors.
Placeholders disappear as soon as any text is entered; append/prepend do not show
overwrite reminders. Taken on's grouped date control is described below.
Commit prepares a clearly not-sent draft; Cancel discards it and
restores focus. Mixed Description opens blank with Overwrite selected. Matching
Description opens prefilled without Overwrite, reserving its bottom-left space.
Add before/after have independent drafts and may be toggled off to edit the shared
text again. All mode controls sit below the textarea. Enter adds a newline;
Cmd/Ctrl+Enter prepares. All-empty unchanged fields cannot commit. Blank Overwrite
clears populated/shared or mixed text; blank Add before/after remains a no-op.
There is no separate text-field Clear action. Drafts are tied
to the image set and survive transient pending reads while preparation is disabled.

Credit demonstrates suggestions; choosing one fills the draft without submitting.
Title and Description have no suggestion provider. Suggestions appear
above the metadata field heading or below its action row, leaving a small gap and
keeping the full editor unobscured. Height is limited by available viewport space;
when no option fits, the list and its keyboard-selection/expanded state are suppressed.
They remain outside the drawer's scrolling content but inside its focus scope and
must not push later fields down.
This differs deliberately from Refine, where selecting a value commits the search.

### Taken on

The selected Segments interaction is implemented by
[MetadataDateInput](../../src/components/MetadataDateInput.tsx): numeric groups
select their contents on focus, advance on complete entry and support left/right
navigation. A separate calendar button opens the native picker at whole-second
precision. Existing milliseconds remain visible and survive unchanged entry;
editing other date/time groups resets them to zero, while deliberate millisecond
entry is retained. The existing local-to-UTC and ambiguous-hour conversion owner
is unchanged, as is the formatted reading display.

Mixed dates initially show an italic `Multiple dates` control; clicking it reveals
the numeric groups and focuses Day. Clear works directly from that mixed state,
dismissing the reminder and preparing an empty date for all targets. Incomplete
or invalid groups disable preparation rather than becoming a clear. The grouped
field has an explicit whole-date Clear and Ctrl/Cmd+A deletion, because individually
emptying seven groups should not be necessary; native-calendar Clear is accepted too.
Pending reads preserve drafts and disable preparation. An unavailable native picker
does not prevent manual entry. New date intents remain disconnected.

The isolated date-entry study has been retired after integration. Production
component tests do not certify physical phone keyboard/native-picker behavior.

### Collections

The app renders chevron-separated breadcrumb pills with remove and partial-coverage
apply-to-all controls, plus Add using the existing collection suggestion provider.
Canonical path IDs remain search/action identity. These new membership actions
prepare not-sent intent only; no tree management or live membership save is connected.
Final desktop/collection UX remains open for operator discussion.

## 5. Preserve the Existing Ownership and Gestures

- **One sheet/focus owner.** Existing focus traps are independent document listeners,
  not a general modal stack. Keep suggestion overlays inside their owning sheet or
  dialog; do not stack another editing modal over it. Selection and image-detail cards
  are nonmodal regions: neither inerts the page. The expanding floaty also has no blocking
  backdrop or document-level focus trap. Outside pointer input closes its options without
  consuming the tap; Tab may leave and close it.
- **Keyboard is part of the layout.** Focused input, suggestions, submission and
  cancellation must stay reachable in the visual viewport. BottomSheet now owns
  temporary viewport height/bottom adjustment and focused-form scrolling.
- **The floaty follows the card.** Selection actions dock above the selection card
  and share its transform. Its joined, single-column blue expansion retains the closed
  floaty's translucency and opens above/below according to actual visual-viewport space.
  Placement follows an in-progress card transition and stops when it settles or closes.
  The closed separator is centred; the Deselect hit area stays fixed as expansion grows
  leftward. Deselect text appears only while expanded. Details toggles the card, using
  Bottom Panel Open/Close icons; the chevron reflects its position and opening direction.
- **Do not reuse long press.** Results already use it for selection/paint/range behavior.
  A hidden long-press edit menu would conflict with that model and discoverability.
- **Scroll ownership matters.** Suggestion/value lists must not become sheet-dismiss
  gestures at the wrong moment. Use the existing own-scroll boundaries deliberately.
- **Targets are strict.** Retained panel content is not current authority. Keep drafts
  tied to their image set; pending/incomplete metadata cannot imply full eligibility
  or exact coverage. Use the existing captured-ID/admission/receipt owners.
- **No per-pill request fan-out.** Badges use already-returned image/tree data; authority
  hydration belongs to the selected operation, not every mounted thumbnail.
- **Back is not rollback.** Distinguish returning to inspection, explicit unsent-input
  cancellation and leaving a dispatched operation to complete. Do not add warning
  dialogs everywhere.

Sources: [focus trap](../../src/hooks/useFocusTrap.ts#L6),
[BottomSheet](../../src/components/BottomSheet.tsx#L34),
[crop viewport precedent](../../src/components/crop/CropEditor.tsx#L83),
[touch selection](../../src/hooks/useTouchSelection.ts#L9),
[content pull ownership](../../src/hooks/useContentPullToDrag.ts#L10),
[current panel targets](../../src/routes/search.tsx#L375),
[label admission](../../src/components/LabelEditor.tsx#L83).

### Search and Detail Actions

Share URL, Full frame, Download, Delete and Library share one action presentation and
captured-target contract across search and detail. Desktop uses full label, short label
and icon-only states with narrow overflow; search separators fill the bar and detail
separators are inset. Deselect stays immediately after the search selection count.
Detail keeps full and short action labels to narrower toolbar widths than the busier
search surface; its container-query overrides do not change search or compact menus.
Search instead shares one measured budget across action/control labels, badge names and
the word matches, including compact mode. Keep numbers and essential controls; shorten
optional labels before clipping, retaining summary scrolling when even the smallest mode
cannot fit. Roomy mobile bars must not hide matches solely because the viewport is narrow.
The main Crop control is disabled Cannot crop when unavailable; its C shortcut shares
the guard. The compact full-frame chevron has a Crop full frame tooltip, with no inline
single-image skip explanation in its dropdown. Delete uses a red second activation tied
to the current targets, with cancellation/expiry rather than an extra confirmation dialog.
Crop rechecks ownership after leaving image fullscreen; navigation, withdrawn capability
or an invalidated API session cancels the pending entry instead of opening the wrong image.

Pending reads block preparation immediately. Only the last settled opacity is retained
to avoid flashing; permission/data updates are not delayed or substituted. All five new
actions remain Not sent previews, including Share. Dismissible previews share the existing
activity panel shell with Labels; connected Label progress retains priority. The latest
20 disconnected previews have stable identities, so adding/dismissing them does not remount
Label controls or reset native disclosures; dismissal returns focus to a usable control. The
[plan checkpoint](gradually-growing-teeth.kupua-edits-steps.md#action-hookup-boundary)
owns remaining command and deletion-compaction work.

## 6. Remaining Design Limits

The earlier focused-field-task recommendation is superseded by the operator's
inline choice. A sheet-wide Edit mode is not requested either. The real desktop/mobile
metadata panels now implement these controls, including collection picking; only Labels
uses connected execution. Other command admission, authoritative merge, write outcomes
and publication remain future hookup work. Archive/unarchive, configured domain editors,
collection-tree management, leases, rights and other roadmap families are not completed
by this UI integration. Thumbnail badge proposals in section 3 remain unimplemented.
The shared popup does not add providers to fields that have none or replace failed API
requests with another datasource.

Real on-screen-keyboard behavior and the comfort of 36px actions remain phone
checks; desktop viewport emulation does not certify either. Backend original-timezone
retention is deferred. Subjects editing and incidental-key focus-ring policy remain
separate backlog items (KUP-051 and KUP-052), not implicit save-hookup prerequisites.
Longer-list popup comfort remains an operator judgment, not a claim established by
single-option visual trials. No new Kahuna phone investigation is required here.

## 7. Shared Suggestion Presentation

The isolated mobile metadata study and its prototype-only browser test have been
retired after the selected interactions were integrated into production components.

Metadata inputs, the real [Refine editor](../../src/components/RefineChips.tsx) and
[LabelEditor](../../src/components/LabelEditor.tsx) use the same
[overlay presenter](../../src/components/SuggestionDropdown.tsx). Metadata and Refine
also share [field suggestion loading](../../src/hooks/useTypeaheadSuggestions.ts):
debounce, bounded candidates and abort/stale-result suppression. Dynamic results are
not re-filtered or reordered; provider scope and matching remain in
[typeahead-fields](../../src/lib/typeahead-fields.ts). CQL keeps AST/publication
ownership and Labels keeps target/comma-token ownership rather than adopting that hook.
Refine supports arrow-key selection within the rendered shortlist and composition-safe
Enter; metadata selection fills a draft, while Refine selection commits a search.
Analyzed fields such as Description and Byline intentionally have no provider.
The [backend suggestion proposal](better-suggestions-aggregation-endpoint-enhancement.md)
owns improved discovery, not this UI guide. Source/local fixture checks do not certify
deployed authentication, backend capacity or physical-phone input behavior.