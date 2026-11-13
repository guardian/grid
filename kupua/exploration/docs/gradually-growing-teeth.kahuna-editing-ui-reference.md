# Editing UI in Kahuna

**Source and UI reference, 10 November 2026.** Describes the current checkout's
editing presentation, not a proposed Kupua design or permission to enable commands.
Browser observations used the operator's isolated local Grid under bounded permission
for the exercises recorded here, not standing permission for future writes. The
initial pass submitted no changes; the later
authorized collection exercise created subcollections and added image memberships
(section 9). A later metadata/interaction rehearsal exercised local metadata
saves and added one allow-use lease (section 10). No uploads, downloads, deletions
or external publication were performed.
Never interpret a visible control as proof of server authorization.

Contents: [evidence](#1-evidence-and-reading-guide),
[field-state matrix](#2-textual-metadata-empty-shared-and-mixed),
[tooltips](#3-tooltips-are-part-of-the-interface),
[placement and authority](#4-context-placement-and-authority),
[editing families](#5-editing-families),
[progress and failure](#6-progress-failure-and-confirmation-vocabulary),
[browser and permission preview](#7-browser-observations-and-permission-preview),
[coverage and limits](#8-coverage-limits-and-use-for-kupua),
[hands-on collections and Kupua ideas](#9-hands-on-collections-and-kupua-ideas),
[metadata and interaction rehearsal](#10-metadata-failure-and-usability-rehearsal),
[preserve-improve-summary](#11-preserve-improve-dont-copy),
[Grid BDD cross-reference](#12-cross-reference-with-grid-bdd),
[persistence and thumbnail inventory](#13-persistence-reasons-and-grid-thumbnails).

## 1. Evidence and Reading Guide

The main questions are what the user sees, why a field/action appears or disappears,
how single and multiple targets differ, what hover explains, and how editing ends.
Source descriptions and browser observations are distinguished throughout. Existing
research supplies context, not a certificate of the current implementation.

Relevant earlier work:

- [Image-detail inventory](01%20Research/kahuna-image-detail-inventory.md): broad layout and action inventory; some field gates and line numbers are historical.
- [Selection findings](01%20Research/selections-kahuna-findings.md): reconciliation and important empty fields.
- [Pills, location and leases](01%20Research/selections-kahuna-pills-location-leases-findings.md): list coverage and composite fields.
- [App-wide UI constants](01%20Research/kahuna-app-wide-ui-constants.md): colours, pencils and confirmation patterns; its exhaustive-confirmation claim predates the current takedown workflow.
- [Labels findings](01%20Research/labels-kahuna-findings.md): label presentation and transport.
- [Search-result signals](01%20Research/kahuna-search-results-cost-signals.md): earlier detailed badge/overlay inventory; current source and the bounded comparison in section 13 take precedence over historical parity recommendations.
- [Editing roadmap](gradually-growing-teeth.kupua-edits-steps.md): Kupua scope and authorization, not Kahuna behavior; its [ordinary metadata UI register](gradually-growing-teeth.kupua-edits-steps.md#ordinary-metadata-ui-coverage) tracks current Kupua coverage separately from this reference.

Metadata presentation has a fresh delegated source pass; the remaining sections
consolidate current action owners and bounded foreground browser inspection.
Section 8 accounts for coverage and limits. This is an editing-interface reference,
not a security audit, exhaustive backend contract or deployed parity certificate.

## 2. Textual Metadata: Empty, Shared and Mixed

### 2.1 There Is No Universal Empty-Field Rule

`userCanEdit` below means the metadata component's parent-supplied presentation
input. Detail obtains it from the image's `edits` link; selection requires every
selected image to pass that check. It is not a global role approximation.
See [edit capability](../../../kahuna/public/js/edits/service.js#L245),
[detail owner](../../../kahuna/public/js/image/controller.js#L180) and
[selection owner](../../../kahuna/public/js/components/gr-info-panel/gr-info-panel.js#L54).

Five ordinary fields remain visible even when empty and uneditable: **Title,
Description, Special instructions, Taken on and Credit**. They show `Unknown`.
The absence itself remains visible information. Byline, Copyright and Location
instead have presence/editability gates. This is structural template behavior,
not a shared important-fields registry.

The standard editable-empty wording is `Unknown (click [pencil] to add)`;
`[pencil]` here denotes Kahuna's pencil glyph, not literal UI text. Mixed scalar
values use field-specific `Multiple ...` messages, adding
`(click [pencil] to edit all)` for editors, with **all** bold.

| Field | Empty, Uneditable | Empty, Editable | Shared / Mixed / Editor |
|---|---|---|---|
| Image type | `Unknown`, only if image types are configured | Standard editable-empty wording | Shared type / `Multiple image types`; select with `-- choose type --`. [Source](../../../kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html#L49) |
| Title | `Unknown`; row retained | Standard editable-empty wording | Shared value searches by title / `Multiple titles`; text input. [Source](../../../kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html#L131) |
| Description | `Unknown`; row retained | Standard editable-empty wording | Plain text, not a search link / `Multiple descriptions`; elastic textarea. [Source](../../../kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html#L195) |
| Special instructions | `Unknown` without usage instructions; otherwise no extra-instructions placeholder | Standard wording, or `Click [pencil] to add further instructions` alongside usage instructions | Mixed detection includes usage and special instructions; only special instructions are edited. [Template](../../../kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html#L274), [predicate](../../../kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js#L180) |
| Taken on | `Unknown`; row retained | Standard editable-empty wording | `d MMM yyyy, HH:mm` / `Multiple dates`; datetime-local. [Source](../../../kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html#L356) |
| By | Omitted when raw byline is falsy | Standard editable-empty wording | Shared value searches `by` / `Multiple bylines`; text input. [Source](../../../kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html#L394) |
| Credit | `Unknown`; row retained | Standard editable-empty wording | Shared credit search / `Multiple credits`; text input with up to eight suggestions. [Source](../../../kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html#L441) |
| Location | Omitted if no component has information or a mixed state | Standard wording when all four components are empty and unmixed | Each populated component searches separately; mixed components say `(Multiple subLocations/cities/states/countries)`. One form edits all four. [Source](../../../kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html#L491) |
| Copyright | Omitted when raw copyright is falsy | Standard editable-empty wording | Shared copyright search / `Multiple copyrights`; text input. [Source](../../../kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html#L613) |
| Uploaded | Single-image only; no explicit empty placeholder | Never editable here | Formatted timestamp. [Source](../../../kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html#L660) |
| Uploader | Omitted when mixed, not explicitly when empty | Never editable here | Shared uploader search, display strips the email domain. Not universally single-image-only. [Source](../../../kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html#L667) |
| Filename | Omitted when empty or mixed | Never editable here | Selectable text; native title contains the full filename. [Source](../../../kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html#L676) |
| Subjects | Omitted unless present on at least one image | Never editable here | Searchable coverage pills, explicitly noneditable. [Source](../../../kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html#L683) |
| People | Omitted unless present on at least one image | Empty row with add control | Search/add/remove/apply-to-all pills. [Source](../../../kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html#L697) |
| Keywords | Omitted unless present on at least one image | Empty section with add control | Search/add/remove/apply-to-all pills. [Source](../../../kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html#L1133) |
| Labels | Not gated by `userCanEdit` in this template | Add control, no `Unknown` placeholder | Explicitly editable list component; do not mistake this exception for authorization. [Source](../../../kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html#L1094) |
| Photoshoot | Does not use the shared `userCanEdit` gate | Editable-empty wording | Shared title only when all images have photoshoot data and titles agree; otherwise mixed message. Suggested text input; whitespace-only save removes it. [Template](../../../kahuna/public/js/components/gr-photoshoot/gr-photoshoot.html#L1), [controller](../../../kahuna/public/js/components/gr-photoshoot/gr-photoshoot.js#L31) |
| Configured domain fields | Omitted unless truthy or mixed, within an available domain section | Standard editable-empty wording | Shared value / `N values`; editor depends on configured type. [Source](../../../kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html#L784) |
| Additional metadata | Single-image only; omitted when calculated item count is zero | No editors | Expandable other metadata, configured aliases and identifiers. [Template](../../../kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html#L737), [count](../../../kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js#L662) |

### 2.2 Matching Is Not the Same for Every Field

Ordinary scalar reconciliation collects distinct values across the selected images,
including missing values when another image supplies that key. A single distinct
value is displayed normally; multiple values give an array in raw metadata and no
shared editable value. Thus one populated value plus missing values is **mixed**,
not a shared value with a percentage. Do not assume null and empty string are
normalized together. [Aggregation](../../../kahuna/public/js/services/image-list.js#L66),
[display conversion](../../../kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js#L497).

Domain reconciliation separately normalizes missing/null/empty-string to missing,
preserves zero, and compares object values by serialization. Its `N values` counts
distinct states, including missing. The template nevertheless uses truthiness:
a uniformly zero-valued domain field can be hidden for viewers or shown as Unknown
for editors. This is a current presentation quirk, not a recommended design.
[Helper](../../../kahuna/public/js/edits/domainMetadata.js#L6),
[tests](../../../kahuna/public/js/edits/domainMetadata.spec.js#L45),
[template gate](../../../kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html#L797).

List pills instead count occurrences in flattened image values. Partial means
`count < images.size`, not scalar inequality. The helper does not deduplicate
within each image before counting. Partial editable pills get apply-to-all;
editable pills get removal. [List owner](../../../kahuna/public/js/edits/list-editor.js#L38),
[occurrence counter](../../../kahuna/public/js/services/image-list.js#L14),
[controls](../../../kahuna/public/js/edits/list-editor-info-panel.html#L1).

### 2.3 Styling and Discoverability

- **Mixed scalar values:** `.image-info--multiple` explicitly uses italics. This is distinct from an empty value. [CSS](../../../kahuna/public/stylesheets/main.css#L2484).
- **Empty values:** muted `#aaa`; ordinary metadata values generally `#eee`; keys bold `#aaa`; links inherit colour with a bottom border. Description/instructions preserve line breaks. [CSS](../../../kahuna/public/stylesheets/main.css#L2451), [text/link styles](../../../kahuna/public/stylesheets/main.css#L2492), [newlines](../../../kahuna/public/stylesheets/main.css#L2357).
- **Pencil:** normally `display:none`, revealed by hovering its parent `.image-info__wrap`; positioned at its top-right. This CSS gate is separate from permission/template `ng-if` and active-form `ng-hide`. Most scalar pencils also disappear during a template metadata preview. [CSS](../../../kahuna/public/stylesheets/main.css#L2410), [example gate](../../../kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html#L142).
- **Pills:** labels use blue/white, partial coverage reversing the colours. People/Subjects/Keywords use dark `#222` with `#aaa` text for full coverage, white with dark text for partial coverage. Pill value text explicitly returns to normal font style. [CSS](../../../kahuna/public/js/edits/list-editor.css#L25), [neutral overrides](../../../kahuna/public/js/edits/list-editor.css#L99).

### 2.4 Editing, Search and Completion

Value search and pencil edit are different controls. Plain links launch their
field search; Shift appends a positive filter, Alt a negative filter, with Alt
winning if both are held. This says nothing about exact backend equality.
[Query helper](../../../kahuna/public/js/search/query-filter.js#L7).

The shared xeditable controls are **Cancel / Save**; blur ignores rather than
saving. Description and Special instructions have their own equivalent buttons
and Escape / Ctrl-or-Meta+Enter handlers. No reset-to-original control is defined
in these panel forms. [Buttons](../../../kahuna/public/js/forms/gr-xeditable/gr-xeditable-buttons.html#L1),
[configuration](../../../kahuna/public/js/forms/gr-xeditable/gr-xeditable.js#L16),
[textarea keys](../../../kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js#L95).

Mixed Description editing offers **Overwrite / Add before / Add after**. Domain
strings offer those modes only when configured `allowEditOptions === true`,
and likewise show them only for mixed values. Generic saves all receive the
controller's description option, so do not describe it as perfectly isolated to
the Description field. Domain concatenation has separate empty-value handling.
[Description options](../../../kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html#L249),
[domain options](../../../kahuna/public/js/edits/domainMetadata.js#L62),
[generic coupling](../../../kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js#L229),
[save strategy](../../../kahuna/public/js/edits/service.js#L333).

Saves compute overrides relative to original metadata; cleared scalar overrides
become empty strings, and unchanged arrays are compared as sets. People/Keywords
split comma input, trim and remove empty entries. Domain save errors return
`failed to save (press esc to cancel)`. [Diff](../../../kahuna/public/js/edits/metadataDiff.js#L4),
[list conversion](../../../kahuna/public/js/edits/service.js#L277),
[domain failure](../../../kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js#L273).

### 2.5 Configured Fields and Upload Are Separate Cases

Domain section labels/descriptions, field types/options and edit-mode opt-in come
from configuration. Aliases resolve by Elasticsearch path, not label equality.
Types include string, datetime-local, integer (minimum zero), select and fallback
text. Sections retain their expanded/collapsed state. Select options discard
falsy configured entries and may add an empty choice for clearing a defined value.
[Schema](../../../common-lib/src/main/scala/com/gu/mediaservice/lib/config/DomainMetadataSpec.scala#L8),
[domain helper](../../../kahuna/public/js/edits/domainMetadata.js#L51),
[section construction](../../../kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js#L349),
[options](../../../kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js#L402).

The required-metadata upload editor is a different surface: autosave rather than
the panel's Save/Cancel, Description textarea but instructions text inputs, its
own capability-disabled controls, and Copyright retained according to initial
presence. Do not apply the panel matrix to it.
[Upload form](../../../kahuna/public/js/upload/jobs/required-metadata-editor.html#L1),
[owner](../../../kahuna/public/js/upload/jobs/required-metadata-editor.js#L28).

## 3. Tooltips Are Part of the Interface

Three distinct things must not be conflated: `gr-tooltip` (Titip/data-title custom
presentation), native `title` tooltips, and accessible names such as `aria-label`
which are not themselves hover text.
[Tooltip directive](../../../kahuna/public/js/components/gr-tooltip/gr-tooltip.js#L11).

Initial metadata tooltip inventory:

| Control | Hover Text / Mechanism |
|---|---|
| Ordinary scalar pencil | No tooltip attribute in this template; guidance is in visible empty/mixed wording. |
| People add | `Add People`, custom tooltip. [Source](../../../kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html#L701) |
| Keywords add | `Add Keyword`, custom tooltip. [Source](../../../kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html#L1139) |
| Label add | `Add label`, custom tooltip. [Source](../../../kahuna/public/js/components/gr-add-label/gr-add-label.html#L1) |
| Partial pill apply | `Apply {elementName} to all`, native title. [Source](../../../kahuna/public/js/edits/list-editor-info-panel.html#L4) |
| Pill remove | `Remove {elementName}`, plus ` from all` when occurrence count exceeds one; native title. [Source](../../../kahuna/public/js/edits/list-editor-info-panel.html#L13) |
| Filename | Full filename, native title. [Source](../../../kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html#L678) |

Further action and status tooltips:

| Surface | Hover Text / Meaning | Source |
|---|---|---|
| Library status | `Kept in Library because the image has been {reasons}.`; plural selection uses `images` and joined reasons. Custom, dynamically updated. | [Template](../../../kahuna/public/js/components/gr-archiver/gr-archiver.html#L1), [reason construction](../../../kahuna/public/js/components/gr-archiver/gr-archiver.js#L59) |
| Upload Library status | Native titles for the kept explanation, `Image has been deleted`, `Remove from Library`, `Add to Library`. A separate component from the top toolbar. | [Template](../../../kahuna/public/js/components/gr-archiver-status/gr-archiver-status.html#L1) |
| Collection Plus | `Click to add image to a collection`, custom left tooltip. | [Picker](../../../kahuna/public/js/components/gr-collection-overlay/gr-collection-overlay.html#L1) |
| Upload collection pill / remove | `Click to open collection: {path joined with > glyphs}` / `Click to remove image from this collection`, custom top tooltips. | [Upload editor](../../../kahuna/public/js/edits/image-editor.html#L239) |
| Metadata-panel collection / remove | Path is visible search-link text; removal says `Remove image from this collection`, custom top-left tooltip. Do not substitute the upload wording. | [Metadata panel](../../../kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html#L1050) |
| Collection tree actions | `Add selected images to this collection`, `Remove selected images from this collection`, `Add a new sub-collection`, `Delete this collection`; native titles explain icon-only controls. | [Node template](../../../kahuna/public/js/components/gr-collections-panel/gr-collections-panel-node.html#L37) |
| Lease Plus / row | `Add lease`; row tooltip supplies `leased by: {actor}` and `leased at: {date}` when actor exists. Row uses the tooltip-content mechanism, not raw HTML interpolation. | [Form](../../../kahuna/public/js/leases/leases.html#L4), [row](../../../kahuna/public/js/leases/leases.html#L142), [formatter](../../../kahuna/public/js/leases/leases.js#L211) |
| Label / lease form buttons | Native `Close`, `Save new label`, `Save new lease`; compact forms can hide the visible Cancel/Save text, making the titles more important. | [Label](../../../kahuna/public/js/components/gr-add-label/gr-add-label.html#L43), [lease](../../../kahuna/public/js/leases/leases.html#L108) |
| Rights editor | `Rights Guide`; mixed-rights help warns that specific information may be missing and overridden; buttons use `close usage rights overrides` and `save usage rights overrides`. | [Form](../../../kahuna/public/js/usage-rights/usage-rights-editor.html#L1) |
| Template | Native `Close` / `Apply template`. | [Form](../../../kahuna/public/js/metadata-templates/metadata-templates.html#L16) |
| Crop entry / cropper | `Crop image [C]`, `Go back to image [esc]`, `Crop [enter]`; ratio choices include `{name} [{initial}]`. | [Entry](../../../kahuna/public/js/components/gr-crop-image/gr-crop-image.html#L1), [cropper](../../../kahuna/public/js/crop/view.html#L1), [ratio setup](../../../kahuna/public/js/crop/controller.js#L77) |
| Existing crops | Author initials explain `Cropped by {actor} at {date}`; incompatible ratio has `{ratio} crops only`. | [Crop item](../../../kahuna/public/js/image/crop.html#L16), [detail](../../../kahuna/public/js/image/view.html#L104) |
| Batch full-frame | Disabled control says `Selected images have full frames`. | [Template](../../../kahuna/public/js/components/gr-batch-export-original-images/gr-batch-export-original-images.html#L10) |
| Download | `Download images`; mixed eligibility warns `Not all selected images are available to download`; unavailable state says `Downloading non-free images requires a lease`. This wording is broader than all possible reasons for a missing download relation. | [Template](../../../kahuna/public/js/components/gr-downloader/gr-downloader.html#L1) |
| Delete | `Delete image`; actual button then enters its distinct confirmation state. | [Component](../../../kahuna/public/js/components/gr-delete-image/gr-delete-image.js#L51) |
| Share / Photo Sales | At 45 or more selected, tooltip explains reducing to 44 or fewer; otherwise names the action. | [Search toolbar](../../../kahuna/public/js/search/results.html#L93) |
| More like this | `Search for a selection of images with similarities to this`. Navigation, not an image edit. | [Component](../../../kahuna/public/js/components/gr-more-like-this/gr-more-like-this.html#L1) |

The custom directive defaults to bottom placement; explicit left/top placements
matter around narrow panels. Empty initial tooltip attributes do not install a
tooltip. Updating text requires the `gr-tooltip-updates` path; do not assume every
interpolated tooltip stays live. Native titles follow browser behavior instead.
[Directive](../../../kahuna/public/js/components/gr-tooltip/gr-tooltip.js#L11).

## 4. Context, Placement and Authority

### 4.1 Search, Detail and Upload Are Different Surfaces

**Search:** global search/upload controls occupy the first bar. A second results
bar contains Collections, match count and, when targets are selected, selection
count, progress, Clear selection, Share, configured Photo Sales, Crop full frame,
Download, Delete/Undelete and Library status. The right info panel has show/hide
and lock/unlock controls; unlocked presentation can disappear as pointer context
changes. Its scalar/list editors are the shared metadata component, not an inline
grid-cell editor. [Toolbar](../../../kahuna/public/js/search/results.html#L1),
[info-panel owner](../../../kahuna/public/js/components/gr-info-panel/gr-info-panel.js#L1).

**Detail:** Back to search at left; Share, More like this, Delete, Download, Library
and Crop at right. Original/full-frame/crop thumbnails occupy the left rail;
the main image is central. The right side contains validity/restriction notices
and Metadata/Usages tabs, with the shared metadata component below. Crop selection
changes both the main preview and relevant download action.
[Detail template](../../../kahuna/public/js/image/view.html#L1).

The shared secondary-navigation menu contains **Takedown** when the containing
detail supplies its capability, alongside navigation/preferences that are not
image edits. It is not another ordinary Delete toolbar button.
[Top-bar composition](../../../kahuna/public/js/components/gr-top-bar/gr-top-bar.js#L31),
[menu](../../../kahuna/public/js/common/user-actions.html#L9).

**Upload/recent jobs:** one richer editor per available image, with status and
preview on one side and rights, leases, required metadata, collections and labels
on the other. Its fields mostly autosave, and job-wide apply controls are not the
search selection mechanism. [Job list](../../../kahuna/public/js/upload/jobs/upload-jobs.html#L1),
[image editor](../../../kahuna/public/js/edits/image-editor.html#L1).

### 4.2 Authority Is Operation-Specific

| UI Decision | Frontend Authority / Qualification |
|---|---|
| Ordinary metadata editing | Per-image `edits` relation; all selected images must pass. Uploader access can supply it without a universal editor flag. |
| Add to Library | Root `archive` relation, plus image-state logic. The current Remove from Library template is not guarded identically; describe the implementation, not an ideal symmetric permission rule. |
| Delete | Per-image `delete` action; selection computes whether every image has it. |
| Restore | Separate deleted-state/session/uploader/reaper logic, not merely the presence of metadata editing. |
| Crop entry | Current component checks `data.valid` and absence of soft deletion. Do not rewrite this as a direct check of the `crops` link. |
| Download | Configured restriction and advertised `download` relation; not the same decision as crop validity. Crop-download configuration is separate. |
| Crop/usage cleanup | Relevant `delete-crops` / `delete-usages` action, plus its containing view's conditions. |
| Takedown | Root feature relation plus cleanup/lease capabilities; ordinary delete actions can be unavailable until cleanup finishes. |
| Labels, Photoshoot, collection Plus | Some templates expose these without the shared metadata `userCanEdit` gate. This is a legacy UI exception, not proof of permission to mutate. |

Sources: [edit capability](../../../kahuna/public/js/edits/service.js#L245),
[root archive](../../../kahuna/public/js/services/api/media-api.js#L135),
[image state](../../../kahuna/public/js/services/image-logic.js#L18),
[restore eligibility](../../../kahuna/public/js/util/get-deleted-state.js#L1),
[crop entry](../../../kahuna/public/js/components/gr-crop-image/gr-crop-image.js#L18),
[download admission](../../../kahuna/public/js/components/gr-downloader/gr-downloader.js#L28),
[takedown admission](../../../kahuna/public/js/takedown/index.ts#L90).

## 5. Editing Families

### 5.1 Labels and Other List Pills

Labels have an always-present section, shared/partial searchable pills and a Plus
form. Plus reveals comma-separated input (`label1, label2, label3...` with an
ellipsis glyph in the actual placeholder), suggestions, Close and Save. Entry
closes when Save starts; the Plus control disables and reports `Adding...`.
Failure alerts and reopens the form; success clears its input. Suggestions replace
the last comma token rather than submitting it. Selecting a suggestion and saving
are separate actions. Existing pills separate value search, partial apply-to-all
and removal. People and Keywords use related list machinery but different outer
visibility/editability gates; Subjects are read-only. See section 2 rather than
treating every pill family as interchangeable.
[Label form](../../../kahuna/public/js/components/gr-add-label/gr-add-label.html#L1),
[label lifecycle/suggestions](../../../kahuna/public/js/components/gr-add-label/gr-add-label.js#L25),
[list controls](../../../kahuna/public/js/edits/list-editor-info-panel.html#L1).

### 5.2 Library / Archive

The toolbar has three nondeleted states: **Add to Library**, **Remove from
Library**, and the disabled **Kept in Library** explanation. During requests it
shows **Adding to Library...** or **Removing from Library...** and disables the
button. Failures use a browser alert. Deleted images instead show **Image Deleted**
or an eligible **Undelete** path.

This is persistence/reaper presentation, not soft deletion. `canBeArchived` is
true when not persisted, or persisted solely because of `archived`. Other reasons
can make the image kept independently of the explicit archive override. Across a
selection, none archiveable means kept; otherwise all persisted selects the
archived presentation, and the remaining case is unarchived. This is not a simple
tri-state checkbox over the raw archived flags. Batch helpers change only images
whose explicit archived value needs changing.
[Template](../../../kahuna/public/js/components/gr-archiver/gr-archiver.html#L1),
[selection state and feedback](../../../kahuna/public/js/components/gr-archiver/gr-archiver.js#L59),
[persistence rule](../../../kahuna/public/js/services/image-logic.js#L22),
[operation](../../../kahuna/public/js/services/archive.js#L16).

### 5.3 Collection Membership and Tree Editing

Single-image metadata has collection pills and a Plus opening an overlaid tree.
Choosing a node adds that image and immediately closes the picker; this close is
not a robust completion receipt. The picker remembers scroll and includes its
own **Edit / Finished** tree-management mode. The local tree inspected here was
initially empty; after the operator created roots, destination choice and real
local additions were exercised in section 9.
[Picker template](../../../kahuna/public/js/components/gr-collection-overlay/gr-collection-overlay.html#L1),
[picker owner](../../../kahuna/public/js/components/gr-collection-overlay/gr-collection-overlay.js#L24).

The search Collections panel is also a batch-action surface. In ordinary mode,
nodes search when clicked and expose hover-child icons for **add selected images**
and **remove selected images**. Pending operations show **Adding... / Removing...**.
In Edit mode, permitted deletion and add-subcollection controls replace those
membership actions. A child form has required name input, Save/Cancel and inline
server error. Deletability comes from the node's advertised action. Tree mutation
and image membership are separate operations; no rename/move or cascade guarantee
follows from these controls.
[Panel](../../../kahuna/public/js/components/gr-collections-panel/gr-collections-panel.html#L1),
[node controls](../../../kahuna/public/js/components/gr-collections-panel/gr-collections-panel-node.html#L1),
[node owner](../../../kahuna/public/js/components/gr-collections-panel/gr-collections-panel.js#L100),
[membership transport](../../../kahuna/public/js/services/api/collections-api.js#L67).

Nodes also accept Grid single-/multi-image drag payloads, highlight during dragover,
and show Adding feedback while adding the dropped identities to that collection.
This is distinct from dropping external files to upload them. The inspected tree
offers child creation; a separate visible root-creation control was not established
here. The existing collections guide explicitly identifies roots as API-only;
the collections client also has an add-root API helper.
[Drop owner](../../../kahuna/public/js/components/gr-collections-panel/gr-collections-panel.js#L294),
[root API helper](../../../kahuna/public/js/services/api/collections-api.js#L28),
[root-collection guide](../../../docs/03-apis/02-collections.md#L16).

### 5.4 Leases

The metadata section is available for editing or when leases exist. Plus opens
an access selector with **Allow use / Deny use / Allow syndication / Deny
syndication**, notes and access-dependent date controls:

- Use leases expose a date range.
- Deny syndication offers optional **Expire** and an end date.
- Allow syndication offers optional **Delay**, a start date, **Call Agency** and
	**Premium** clauses, which become notes text.

Cancel closes/reloads leases; Save closes the form and shows updating state.
Missing access produces an alert. Replacing existing syndication leases asks a
native confirmation, with single/multiple-image wording. A single image shows
lease rows with names, relative start/end text, notes, actor/time hover and
two-click deletion for editors. Multiple images show a current/inactive summary
instead of the individual list. Upload-job controls can replace all job leases
or reveal **Remove ALL leases in job?**; that is a different workflow.
[Template](../../../kahuna/public/js/leases/leases.html#L1),
[save and confirmation](../../../kahuna/public/js/leases/leases.js#L54),
[dates/tooltips/classification](../../../kahuna/public/js/leases/leases.js#L211).

Colours distinguish allow-use (teal), generic allow (light green) and deny (red).
The controller assigns active/inactive classes, but do not assume every assigned
class has a distinct styled appearance. Its current-count helpers also do not
return their computed expressions in this checkout, so a rendered blank count is
not evidence of zero leases. [CSS](../../../kahuna/public/js/leases/leases.css#L35),
[count helpers](../../../kahuna/public/js/leases/leases.js#L215).

### 5.5 Usage Rights and Restrictions

Pencil replaces the summary with a category-driven form: guide link, category
selector, caution/description, required properties, options, dependent comboboxes
and restriction controls. Small option lists use radios, larger ones selects;
free strings and textareas use configured examples. Required restriction/special
instruction wording is displayed separately; **Restricted / Add further
restrictions** reveals user text where allowed. Fixed default restrictions can
be disabled text, not an editable blank.

Mixed categories have a **Multiple categories** choice; mixed rights warn that
specific information may be missing and overwritten. Save is unavailable for
the mixed placeholder or an invalid form; saving disables category changes and
shows pending feedback. Cancel and Save have distinct override-related titles.
The catalogue/configuration determine the actual fields; one local category
snapshot does not establish every deployment's form.
[Form](../../../kahuna/public/js/usage-rights/usage-rights-editor.html#L1),
[category reconciliation](../../../kahuna/public/js/usage-rights/usage-rights-editor.js#L36).

Saving can also change category leases and metadata derived from rights. Current
code broadcasts lease work and calls completion from `finally`; a closed form is
not proof that all dependent work succeeded. Document this as a behavior to
understand, not a completion guarantee for Kupua.
[Save composition](../../../kahuna/public/js/usage-rights/usage-rights-editor.js#L177).

### 5.6 Metadata Templates

Configured, editable single-image metadata exposes **Fill in from template**.
Selecting a template previews metadata/rights/collection/leases, replacing or
marking affected presentation; ordinary field pencils may be withheld while the
preview is active. **Cancel** restores the original preview inputs; **Apply**
starts the composed changes and shows pending feedback. The upload editor uses
the same template owner in its different layout.

Template strategies are replace/append/prepend with placeholder resolution;
leases can add or replace and carry durations. Execution orders metadata,
collection, rights plus derived metadata, then leases. Errors are logged and the
final callback still runs: there is no cross-service transaction or truthful
all-or-nothing implication in merely returning to the read presentation.
[Form](../../../kahuna/public/js/metadata-templates/metadata-templates.html#L1),
[preview/selection](../../../kahuna/public/js/metadata-templates/metadata-templates.js#L137),
[application](../../../kahuna/public/js/metadata-templates/metadata-templates.js#L164).

### 5.7 Photoshoots, Syndication and Photo Sales

Photoshoot is a distinct suggested-text editor, not ordinary metadata. Shared
titles require every image to have photoshoot data and agree; empty save removes
assignment. Its template does not use the common metadata-editability gate.
Syndication-rights display from RCS is informational and single-image; distinguish
it from writable usage-rights/lease controls and from sending an image externally.
[Photoshoot](../../../kahuna/public/js/components/gr-photoshoot/gr-photoshoot.html#L1),
[owner](../../../kahuna/public/js/components/gr-photoshoot/gr-photoshoot.js#L31),
[syndication display](../../../kahuna/public/js/components/gr-syndication-rights/gr-syndication-rights.html#L1).

Configured **Send To Photo Sales** is a search-selection action, also gated by
the paid-image/session presentation. At most 44 are admitted by the toolbar.
All-valid and mixed-valid selections open an **Are you sure?** modal with **No /
Yes, send**; no eligible targets produces a warning instead. Mixed wording says
which count will be sent and which already exist. The current handler starts
requests, clears selection and announces sending without awaiting each returned
promise. Its notification is not delivery confirmation.
[Toolbar](../../../kahuna/public/js/search/results.html#L105),
[handler/modal](../../../kahuna/public/js/search/results.js#L678),
[wording](../../../kahuna/public/js/util/constants/sendToCapture-config.js#L1).

### 5.8 Cropping, Full Frame and Saved Results

Eligible detail has **Crop image** plus a dropdown for full-frame creation when
one does not already exist. Ineligible detail says **Cannot crop**. Search has
a separate batch full-frame control, with **Confirm full frame** on its next
activation; when all targets already have full frames it is disabled with an
explanatory tooltip. Full frame creates an export, not an original download.
[Entry](../../../kahuna/public/js/components/gr-crop-image/gr-crop-image.html#L1),
[single full frame](../../../kahuna/public/js/components/gr-export-original-image/gr-export-original-image.js#L20),
[batch](../../../kahuna/public/js/components/gr-batch-export-original-images/gr-batch-export-original-images.js#L24).

The crop page puts X/Y/width/height numeric inputs, ratio choices, cost/restriction
notice and Crop in its bar, above a manipulable image. It shows image-loading
text, small-crop warning (width below 1,000), configured circular guide/mask, and
GNM 5:3 warning gutters where applicable. Back/Escape return to the image;
Enter creates, and ratio initials select presets. Crop changes to **Cropping...**
and blocks duplicate activation. After creation the owner waits for the returned
export identity to appear and navigates to that crop.
[Page](../../../kahuna/public/js/crop/view.html#L1),
[creation, warnings and keys](../../../kahuna/public/js/crop/controller.js#L174).

Saved originals/full frames/crops appear in detail's left rail with dimensions,
creator initials and hover attribution. Ratio-constrained pickers can disable
incompatible crops. Selecting a crop changes the main image and, when configured,
provides a selected-crop download. Metadata also has a collapsible rendition list.

The saved list is obtained through the image's advertised `crops` relation, then intersected
with its projected exports. Missing that relation does not populate the list. A saved-crop
URL selects from this same loaded list; it does not independently fetch an arbitrary export
or bypass the relation. This is distinct from the normal button's validity check. Whether
to replace the empty-looking state with a greyed explanation remains a separate UX decision.
[List and URL lookup](../../../kahuna/public/js/image/controller.js#L270),
[relation follow](../../../kahuna/public/js/services/api/media-cropper.js#L60).

Batch full-frame requests are attempted without the single-image validity guard. Cropper
rejects invalid images with `400 invalid-image`; batch tracking logs rejected items and emits
only successes, rather than showing per-image rejection reasons in this control.
[Batch](../../../kahuna/public/js/components/gr-batch-export-original-images/gr-batch-export-original-images.js#L47),
[validation](../../../cropper/app/controllers/CropperController.scala#L169),
[settlement](../../../kahuna/public/js/util/batch-tracking.js#L48).

[Detail rail](../../../kahuna/public/js/image/view.html#L40),
[crop item](../../../kahuna/public/js/image/crop.html#L1),
[rendition list](../../../kahuna/public/js/components/gr-display-crops/gr-display-crops.html#L1).

### 5.9 Downloads and ZIP

One image uses a download link; multiple images use a Download button and ZIP
generation. A configured selected-crop dropdown is separate. With download
restriction enabled, relation presence and deletion state divide targets into
all/some/none downloadable: partial eligibility shows a warning but the current
batch action proceeds with the downloadable subset. None gives **Cannot download**.
During ZIP work the button disables and says **Downloading**; failure alerts.

This subset behavior is a Kahuna observation, not permission to silently adopt it
for Kupua edits. Downloads can record usage; even their GET links are not safe
preview/prefetch probes. The current ordinary template does not expose every
low-resolution URL calculated internally as a separate visible choice.
[Template](../../../kahuna/public/js/components/gr-downloader/gr-downloader.html#L1),
[admission/progress](../../../kahuna/public/js/components/gr-downloader/gr-downloader.js#L28),
[ZIP/names/available URIs](../../../kahuna/public/js/services/image/downloads.js#L15).

### 5.10 Upload, Jobs and Post-Upload Editing

Upload opens a multiple-file picker; file dragging reveals a **Dropzone!** overlay.
Jobs show preview/name/size, current status, explicit upload-error text and removal
for failed entries. Once an image resource is available the job becomes an image
editor. Size-limit skipping and service-upload versus direct-bucket preparation
are configuration-dependent. No upload or signed-bucket interaction was exercised
for this reference.
[Picker](../../../kahuna/public/js/upload/file-uploader.html#L1),
[dropzone](../../../kahuna/public/js/upload/dnd-uploader.html#L1),
[file-only drag admission](../../../kahuna/public/js/upload/dnd-uploader.js#L77),
[manager](../../../kahuna/public/js/upload/manager.js#L16),
[jobs](../../../kahuna/public/js/upload/jobs/upload-jobs.html#L1).

The completion editor separates **Image Rights / Image Metadata / Organisation
and Grouping**. It has Saving/Saved/error feedback and job-wide apply icons with
titles such as **Apply this description to all your current uploads**. Applying
an empty set can reveal an explicit remove-all job action. Required metadata
autosaves using per-control debounce/blur behavior; no general Save button should
be inferred from the inline panel's design. The duplicate-image case can disable
metadata with an uploader-related explanation. Deleted duplicates offer an
eligible Undelete and explain why it may be unavailable.
[Image editor](../../../kahuna/public/js/edits/image-editor.html#L1),
[required metadata](../../../kahuna/public/js/upload/jobs/required-metadata-editor.html#L1).

### 5.11 Soft Delete, Restore and Privileged Cleanup

Ordinary image Delete is gated by advertised deletability and uses a two-click
button: **Delete** then a red **Confirm delete**, reverting after five seconds.
Search restore uses **Undelete / Confirm Undelete**, with `Undelete image` hover
text, through that same two-click mechanism. The Library component's eligible
deleted-image **Undelete** button calls its own handler directly; upload's
duplicate-image restore is another surface. These must not all be described as
the same confirmation. Search hides/shows the relevant selection actions; detail
also has deleted-state notices. Current delete polling
treats lookup failure as completion, so disappearance is not strong proof of
source handoff. This is not a recommended Kupua error policy.
[Confirmation](../../../kahuna/public/js/components/gr-confirm-delete/gr-confirm-delete.js#L7),
[delete owner](../../../kahuna/public/js/components/gr-delete-image/gr-delete-image.js#L15),
[restore component](../../../kahuna/public/js/components/gr-undelete-image/gr-un-delete-image.js#L44),
[Library restore](../../../kahuna/public/js/components/gr-archiver/gr-archiver.html#L45),
[deleted eligibility](../../../kahuna/public/js/util/get-deleted-state.js#L1).

**Delete ALL crops** and **Delete All Usages** additionally require typing
`DELETE` into a native prompt after the two-click control. Crops warn that public
uses may break; usages warn that deleting records does not remove the image from
where it was used. These are privileged cleanup, not routine metadata changes or
an automatic prelude to ordinary Delete.
[Crop cleanup](../../../kahuna/public/js/components/gr-delete-crops/gr-delete-crops.js#L18),
[usage cleanup](../../../kahuna/public/js/components/gr-delete-usages/gr-delete-usages.js#L27).

### 5.12 Guided Takedown and Hard Delete

The current separate takedown workflow is a major exception to older inventories.
Its route requires the feature and cleanup/lease capabilities. It checks active
content before unlocking Grid cleanup, showing pending/published web uses and
links to the owning editorial tools; unknown/front and pending print usages have
their own review wording. Loading/unavailable evidence is not simply no content.
[Admission](../../../kahuna/public/js/takedown/index.ts#L90),
[content presentation](../../../kahuna/public/js/takedown/delete-from-content-step.tsx#L60),
[step ownership](../../../kahuna/public/js/takedown/takedown-context.tsx#L210).

The Grid step offers **Soft Delete / Hard Delete / Deny Lease**, then **Continue**,
a method-specific destructive **Confirm ...**, and Cancel. While submitting it
shows pending state, disables controls and can display a specific failure. It
lists crops/usages affected; Deny Lease retains downloaded and published-print
usage records. Cleanup precedes the final action, with refreshed action admission
after cleanup and observed status afterward. The options narrow as earlier
steps complete. Hard deletion is real functionality here, not an ordinary batch
toolbar action. Current 404-to-hard-deleted handling is implementation behavior,
not universal proof of irreversible asset removal.
[Methods/retained usages](../../../kahuna/public/js/takedown/delete-from-grid-step.tsx#L38),
[execution](../../../kahuna/public/js/takedown/delete-from-grid-step.tsx#L243),
[confirmation UI](../../../kahuna/public/js/takedown/delete-from-grid-step.tsx#L339),
[status interpretation](../../../kahuna/public/js/takedown/takedown-context.tsx#L28).

## 6. Progress, Failure and Confirmation Vocabulary

Kahuna has several completion models, not one shared receipt:

- Inline scalar Save/Cancel and field-level pending/error styling.
- Add-label/lease pending states and action-specific failures.
- Search batch progress, **Updating {field}: {completed}/{total}**, with a filled
	toolbar background and a document-exit warning while batch entries remain.
- Upload Saving/Saved/error text and job statuses.
- Native alerts/prompts/confirms, two-click buttons, Photo Sales modal and the
	newer guided takedown confirmation. These cannot be summarized as one pattern.

[Search progress](../../../kahuna/public/js/search/results.html#L79),
[progress/exit owner](../../../kahuna/public/js/search/results.js#L907),
[upload feedback](../../../kahuna/public/js/edits/image-editor.html#L135),
[scalar styling](../../../kahuna/public/stylesheets/main.css#L2455).

Source-level completion callbacks sometimes include rejected or unawaited work.
Consequently, a spinner stopping, picker closing, selection clearing or success
notification is not interchangeable with acknowledgement, projected visibility or
completion of every dependent step. The editing roadmap intentionally requires
stronger accounting in Kupua; this reference does not turn legacy behavior into
acceptance criteria.

## 7. Browser Observations and Permission Preview

All successful observations below used a foregrounded desktop Kahuna tab on the
operator's local throwaway corpus. No identities, actor values, response bodies
or signed delivery URLs are retained here.
The table describes the initial non-submitting pass; sections 9 and 10 add later
authorized local writing exercises and distinguish their retained changes from
synthetic presentation/failure checks.

| Observation | Result / Limit |
|---|---|
| Detail and search selection | Inspected detail toolbar/rails/metadata and one-/two-image results controls. No commands submitted. |
| Empty Title | Pencil absent before parent-row hover, present afterward. Placeholder muted `rgb(170, 170, 170)`, normal rather than italic. Opens an empty text input with Cancel/Save; cancelled. |
| Single Description | Opens a textarea inline; cancelled. |
| Mixed Description | Two selected images show italic `Multiple descriptions (click [pencil] to edit all)`. |
| Partial/full labels | Native titles include `Apply label to all`, `Remove label` and `Remove label from all`, according to coverage/occurrence. |
| Library tooltip | Actual hover exposes the complete kept-in-library reason, beyond the disabled status text. |
| Form shells | Opened/cancelled Label, Lease and Rights forms. Label placeholder and button titles, four lease access choices and rights shell inspected. No complete configured-rights catalogue claim. |
| Collections, initial pass | Picker shell opens; local tree empty at that time. Later populated-tree editing and membership additions are recorded in section 9. |
| Local rendering | Material Symbols stylesheet is blocked by this local CSP, and local Pinboard/live-reload assets also report failures. Do not attribute those to intended editing design. |

### 7.1 Simulating Uneditable Metadata Without Another Uploader

Uploading as somebody else is not necessary to inspect the frontend's ordinary
metadata viewer state, and may not remove editing from an account with global
edit permission. Real account/permission setup is separate from presentation.

A bounded local browser experiment temporarily replaced
`editsService.canUserEdit` with a false-result function and reloaded the current
Angular state. No image body, uploader, cookie, server permission or backend guard
was changed, and no control was activated during the preview. Results:

- Empty Title and Special instructions remained as `Unknown`, without edit hints
	or scalar pencils.
- Empty People and Keywords sections were absent.
- Label Plus and Photoshoot's pencil still existed, confirming their separate
	template gating. This does not establish that the server would accept a write.

The exact service function was restored, the temporary page-memory owner removed,
and a full reload restored ordinary editable Title controls. A prior attempted
response-interception preview timed out, cleaned up and is **not** credited as a
successful absent-link or authorization-boundary test. The successful experiment
exercises the component's existing presentation input; source tracing supplies
the `edits`-link connection, not a browser-verified stripped-response claim.

## 8. Coverage, Limits and Use for Kupua

| Family | Fresh Evidence | Not Established Here |
|---|---|---|
| Empty/shared/mixed scalar and configured-domain metadata | Current source pass; Description prepend/append/overwrite/clear and Title shared/mixed/empty saves with local readback (section 10) | Every configured domain type rendered; real restricted principal; every null/empty/date combination |
| Pills/labels/people/keywords/subjects | Source and single/multi UI; native action titles and form shell | Mutation success/failure or suggestion ranking in this session |
| Archive and collections | Current owners/templates; kept tooltip; later child/grandchild creation, populated picker, single/multi drag and explicit selection-add with local readback (section 9) | Every persistence combination; removal/deletion, rejected membership, concurrency or shared-system capacity |
| Leases, rights, templates, photoshoot/syndication | Current owners; populated local allow-use lease and read-only presentation; complete Creative Commons/restriction drafts cancelled without applying (section 10) | Template application, lease replacement, rights-save side effects, external syndication; no local template/domain specs configured |
| Crop/full frame/results/downloads | Current templates and command/presentation owners; detail eligibility state | Crop creation, selected rendition delivery, ZIP generation or download usage |
| Upload and completion editor | Picker/dropzone/jobs/editor/manager source | Actual upload, import, duplicate recovery or bucket policy |
| Delete/restore/cleanup/takedown | Current controls, admission, confirmation and status owners | Any destructive command, external editorial tool or deployed authorization test |
| Progress/errors/keyboard | Cancel/Meta+Enter, unsent draft/selection/route checks, one suppressed-PUT synthetic 403, keyboard search-link activation and narrow touch-emulated detail (section 10) | Navigation during accepted writes, real authentication faults, post-dispatch loss, every shortcut/browser combination or real phone keyboard |

This consolidates the editing families, not every hover pixel or deployment
variant. URL import is named in the broader roadmap, but a user-facing URL-import
control has not been established by this session's file-upload/drag/job inspection;
do not count backend support as a demonstrated UI. Mobile editing is not certified:
Kahuna's hover-driven desktop pattern is a reference, not a finished phone model.
Source links identify the inspected ownership surface; earlier research is linked
for depth and explicitly qualified where current source differs.

For Step 7, reuse the useful semantics: separate search/edit gestures, retain
important empty fields, distinguish scalar mixedness from pill coverage, explain
disabled status, expose exact selection scope and separate archive from other
persistence reasons. Whether Kupua uses a toolbar, sheet or floating control is
a design decision, not something this descriptive reference authorizes. Tree
management, other field families and destructive workflows keep their separately
selected scope. No implementation, deployment, account change or live activation
is authorized by completing this document.

## 9. Hands-On Collections and Kupua Ideas

### 9.1 Scope and Retained Local Data

**Operator-authorized local exercise, 10 November 2026.** The operator started
Grid without TEST flags, created three roots using the API helper, and requested
real subcollection creation, dragging and metadata-picker additions. All exercised
collection command URLs and canonical verification reads targeted the local
collections/media-api hosts. No account/key/configuration changes, TEST/PROD
operations, uploads or deletion were performed.

Created through Kahuna's ordinary tree controls:

```text
UI Research
	Landscapes
	Portraits
		Needs review
```

The other roots were `Another collection` and `Thirteenth collection`. Three
child-creation requests succeeded (HTTP 200). One deliberate `Needs / review`
submission returned 400 and displayed the server's validation message; correcting
the same form created `Needs review`. No malformed collection was created.

Image identities stayed in page memory. In the account below, **A** and **B** are
the first two selected images; **C** is a third, unselected drag origin. Final
direct memberships left for further UI exploration:

| Image | Added Direct Memberships |
|---|---|
| A | `UI Research / Portraits / Needs review`, `UI Research / Portraits`, `Another collection` |
| B | `UI Research / Landscapes`, `UI Research / Portraits`, `Another collection` |
| C | None from this exercise |

These are direct memberships, not a claim that ancestor paths are automatically
assigned. The six additions used the normal UI and projection/readback path;
earlier memberships and labels were retained. Bounded explicit singleton reads
also verified the metadata add, individual drag and selected-pair drag. The final
tree-button addition returned 200 for each of A/B and appeared on both result
cards through Kahuna's existing readback. No direct ES write or manual cache
publication substituted for the UI.

### 9.2 What the Workflows Actually Required

**Create a child or grandchild:** open Collections, press **Edit**, hover the
parent row to reveal its folder-plus, then enter a name in the inline form and
press the check icon (native title **Save**). The parent is identified by where
the form sits, not by an explicit destination label in that form. After success
the form disappears, but the parent remains collapsed: neither Portraits nor its
later Needs review child became immediately visible. Expanding the parent is a
separate step. The new row appears in sorted sibling order.

Edit mode alone does **not** reveal the row actions: they still require hover.
The example-name placeholder is `e.g. summer2015...` (ellipsis glyph in the actual
UI), with icon-only Save/Cancel. Slash validation occurs after the request, using
the inline message `You cannot have slashes or double quotes in your path name`.
Correcting the input in place worked. Tool selector/name failures are not counted
as user-visible product defects; hidden actions and collapsed successful results
were separately observed in the ordinary page.
[Row controls](../../../kahuna/public/js/components/gr-collections-panel/gr-collections-panel-node.html#L37),
[hover CSS](../../../kahuna/public/js/components/gr-collections-panel/gr-collections-panel.css#L1),
[creation and one-time capability read](../../../kahuna/public/js/components/gr-collections-panel/gr-collections-panel.js#L125).

**Add one image from metadata:** leave tree-edit mode, select A, open its info
panel, press Collections Plus, and choose Needs review in the overlay tree. The
overlay reused expanded-branch state from the left tree. Clicking the name was
the submission: there was no final Add control or visible image-count summary.
It closed before canonical membership was shown; the local write returned 200,
then metadata displayed `UI Research > Portraits > Needs review` (breadcrumb
glyphs in the actual UI). Search query remained unchanged.
[Picker behavior](../../../kahuna/public/js/components/gr-collection-overlay/gr-collection-overlay.js#L24).

**Drag a single image:** clear selection, drag B's thumbnail onto Landscapes in
the left tree. Native drag/drop succeeded, with trusted events and the Grid
single-image payload at drop. The row showed **Adding...**, then the result card
displayed Landscapes; a canonical local image read confirmed membership. No
synthetic DataTransfer injection or direct service invocation was needed.
[Payload owner](../../../kahuna/public/js/main.js#L454),
[drop handler](../../../kahuna/public/js/components/gr-collections-panel/gr-collections-panel.js#L294).

**Select multiple images:** after A/B were selected, the entire Collections
section and its Plus disappeared from the metadata panel. This is not a disabled
button explaining the limit; the entry point is absent. Tree rows instead offer
hover-only adjacent **Add selected images to this collection** and **Remove
selected images from this collection** icons. Their titles explain the actions
but do not state how many images are targeted. The explicit Add icon on Another
collection added both selected images, retained selection, and updated both cards.
[Single-image gate](../../../kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html#L1050),
[tree actions](../../../kahuna/public/js/components/gr-collections-panel/gr-collections-panel-node.html#L57).

**Drag while other images are selected:** with A/B selected, drag the unselected
C thumbnail onto Portraits. The drag displayed a **2** badge and carried the
multi-image payload. Canonical reads confirmed that **A/B were added and C was
not**. The drop handler prefers selection payload over single-image payload.
The window-level producer adds the current selection to any dragstart while the
selection is nonempty; its scope is not restricted to dragging a selected card.
This is a concrete scope surprise, not evidence that drag/drop was unavailable.
[Selection payload](../../../kahuna/public/js/search/index.js#L263),
[payload precedence](../../../kahuna/public/js/components/gr-collections-panel/gr-collections-panel.js#L306).

**Stale Delete affordance:** after Portraits gained Needs review, entering Edit
and hovering Portraits still exposed **Delete this collection**. A fresh local
tree response showed one child and no remove action for that parent. The current
node controller reads deletability once; adding a child does not revalidate that
cached affordance. No Delete control was activated, so this is evidence of stale
presentation, not successful non-leaf deletion. The backend has its own
children-checking refusal path.
[Cached capability](../../../kahuna/public/js/components/gr-collections-panel/gr-collections-panel.js#L131),
[server actions and deletion guard](../../../collections/app/controllers/CollectionsController.scala).

Temporary drag observers and page-memory identities were removed, mouse input was
released by the completed drag gestures, and tree-edit mode was left off. The
new collections/memberships intentionally remain. Two selected images provide a
useful comparison state: the tree has batch actions while metadata has no
Collections section.

### 9.3 Kupua Improvements to Explore, Not Implemented Decisions

The clearest improvement is **one Add to Collection workflow for single and
multiple targets**, available from metadata as well as any action bar. Selection
must not make the field vanish. Its owner should capture the complete target set
at the action, as labels already do; loaded rows or a partial metadata summary
must not silently redefine it.

Recommended interaction direction:

| Problem Witnessed or Source-Established | Kupua Proposal |
|---|---|
| Single/multi entry points differ, and multi metadata loses the field entirely | Keep Collections visible. Offer **Add to collection** for one or many images, with an explicit target count. Show membership coverage separately from addition, not a misleading blank shared value. |
| Picker name click submits immediately without target scope | Use a searchable picker with full-path results, a visible `N images` scope and destination breadcrumb. One **Add N images** command commits the choice; no extra confirmation dialog for ordinary additions. |
| Deep trees require repeated expansion and short leaf names can be ambiguous | Keep browseable hierarchy, but add path/name search that does not require opening each ancestor. Distinguish same-named leaves by their complete paths. This search is a proposed improvement, not a performance diagnosis from this small tree. |
| Edit mode still hides child-creation controls until hover | Make tree-management affordances discoverable while managing the tree. Use a predictable row menu or explicit create-child action, with non-hover access for keyboard/touch. |
| Child form identifies its parent only by position | Say **New collection in UI Research / Portraits**, provide a labelled Name field, and keep focus/error treatment local. |
| Slash rejection comes after a request | Mirror known server name restrictions locally, while retaining server validation and its real failures. Do not invent extra restrictions or claim client validation provides authority. |
| Successful creation leaves the new child hidden | Expand the parent, reveal/highlight the new row, and keep the user in the same neighborhood. Do not collapse or globally reset the tree. |
| Parent retains a stale Delete affordance after gaining a child | Accept returned capability/state changes into the owning tree and recompute dependent affordances. Do not rely on an old once-read flag, and do not infer deletion permission from an empty visible branch. |
| Adjacent hover-only Add/Remove icons do not state the target count at the action | Separate membership removal from the primary add path, and state target scope. Ordinary addition should not require discovering a tiny icon next to removal. Removal still belongs to its separately approved workflow. |
| Dragging unselected C acts on selected A/B | Kupua's current grid already follows **drag a selected card -> selected set; drag an unselected card -> that card** (confirmed in section 13). Preserve that scope rule; improve count/destination feedback where needed rather than reimplementing it. |
| Picker closes before outcome is visible | Keep a lightweight destination/count outcome available after closing: pending, acknowledged/observed, rejected or uncertain. Closing a picker must not masquerade as success; reuse operation ownership rather than inventing another queue. |
| Root creation requires an API helper | Consider a root-create affordance in later tree-management work if permissions/product scope permit. Its current absence is not a reason to expand Step 7 into tree CRUD automatically. |

Desktop can use a compact dialog/popover with hierarchical search; mobile should
use the same target/destination semantics in a keyboard-aware sheet, with visible
scope and a reachable commit action. Do not simply shrink hover controls or add
a floating button that obscures the current selection sheet. Tree management
and selecting a destination should remain visibly different intents, even if
they share a renderer. No finished mobile design or backend scalability claim
follows from this desktop exercise.

These proposals respond to the operator's request for improvements and missing
capabilities. They authorize no product code, backend repair, destructive action
or rollout. Step 7's addition work and Step 12's removal/tree management retain
their own approval boundaries.

## 10. Metadata, Failure and Usability Rehearsal

### 10.1 Real Local Metadata Saves

**Operator-authorized local rehearsal, 10 November 2026.** Two existing research
images had different descriptions and empty titles/bylines. Their initial full
responses were held only in page memory. The following saves used ordinary
Kahuna controls and local metadata-editor, with acknowledgement and media-api
readback rather than manual publication into a cache.

| Case | Observed Behavior |
|---|---|
| Open mixed Description | Italic mixed wording; blank textarea; Overwrite selected; **Overwrite / Add before / Add after** available. |
| Add before | One entered prefix was prepended to each image's own description with a separating space. Both writes returned 200 and both expected canonical values were observed; differences were retained. |
| Add after | Added a suffix to each individually preserved description. **Meta+Enter** submitted successfully; both writes returned 200 and both expected canonical values were observed. |
| Reopen after Add before | The previously selected **Add before** mode remained selected, rather than resetting to Overwrite. This is mode persistence, not an assertion that every other field was exercised under that mode. |
| Overwrite mixed Description | Explicitly chose Overwrite and supplied one shared value. Both canonical descriptions matched it. Reopening prefilled that shared text and omitted the mixed-only mode controls. |
| Clear Description | Saving empty text cleared the effective value on both images. Both writes returned 200 and readback matched the empty postcondition; the panel showed editable `Unknown`. This does not establish every original/override reset representation. |
| Shared Title | A shared research title saved to both images (200 each). The settled shared search-link text had normal, not italic, font style. A subsequent single-image edit was prefilled. |
| One empty, one populated Title | Clearing one image (200) produced `Multiple titles (click [pencil] to edit all)` for the pair. Its batch editor was blank, even though one target still had the research title. |
| Restore descriptions | Restored each original description through its single-image editor (200 each). Final canonical reads confirmed both original descriptions, original label/collection memberships and unchanged rights. |

This was thirteen real metadata PUTs, not thirteen batches. Final retained state:
the first image's Title is empty; the second retains `Shared UI study title`.
The descriptions are restored. The first image also retains the later research
lease described below. All exercised write/read hosts were local; no shared-system
or production inference follows.

An immediate display sample after canonical overwrite still contained a mixed
label before publication settled. It is **not** credited as a persistent display
defect; the subsequent form showed the shared value and no mixed-only modes.
This illustrates why canonical matching, owner publication and a settled visible
assertion must not be collapsed into one observation.

Sources: [Description form and modes](../../../kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html#L195),
[textarea keyboard handling](../../../kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js#L95),
[mode lifetime and save delegation](../../../kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js#L206),
[per-image concatenation](../../../kahuna/public/js/edits/service.js#L333).

### 10.2 Unsent Draft and Target Changes

With a mixed Description editor open, entering a draft and deselecting one of the
two targets left the editor open but changed its contents: the entered draft was
not retained at that boundary, and the mixed-only modes disappeared. No Save was
pressed. This differs from a deliberate cancel or an operation with fixed targets.
An additional **Escape** check on an unsent textarea closed it as expected.

For a separate route-lifetime check, entered another unsent mixed Description
draft, navigated through Angular's router to the first image, then used the
ordinary **Back to search** link. Neither detail nor the returned search retained
the editor; the returned search had no selected images in this setup. Detail entry
was programmatic, so this is a component/route-lifetime witness, not a certificate
for native browser Back, every detail-entry gesture or every selection policy.
No draft was submitted and no operation was in flight during these transitions.

Kupua should keep unsent input bound to its target ownership, make a target change
explicit, and distinguish discard from navigation. Its label owner already supplies
a precedent; do not introduce a generic job system merely to preserve draft text.
[Selection-driven reconstruction](../../../kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js#L69),
[current label ownership](../../src/stores/label-editor-store.ts).

### 10.3 Bounded Rejection Fixture and Its Limits

To avoid creating a genuinely uncertain write, a page-local XHR fixture suppressed
exactly one selected image's **local metadata PUT** before native `send`. Ordinary
reads continued unchanged. Held that request briefly, then supplied a synthetic
403 and Argo-shaped rejection through XHR's normal completion path. The fixture
did not change server authentication, an API response's image body or capabilities.

The resulting metadata area fell back to **No images selected** while a selected
result tile still existed, and component errors were logged. The expected field
was no longer available to the probe. This is not evidence of a useful retained
draft/error presentation. Specific pending-control measurements were not retained
by the interrupted probe and are not claimed here.

The source explains a relevant weakness: `trackAll` gathers fulfilled results from
`allSettled`, logs failures, announces completion and emits the success list. A
rejected one-target action can therefore emit an empty update list. That matches
the observed failure path, but this reference is not a complete diagnosis of each
downstream component error. No product repair was made.
[Batch completion and emitted successes](../../../kahuna/public/js/util/batch-tracking.js#L39).

The exact original XHR methods were restored; the fixture had suppressed one PUT;
a canonical read confirmed the real Title was still empty. An ordinary Angular
state reload recovered the results view. No further fault branches were layered
onto the broken state. Real 401/419 reauthentication, a server-issued rejection,
network loss **after dispatch**, mutation uncertainty/replay, and a complete slow-
save control-state matrix remain unverified. A synthetic pre-dispatch rejection
must not be described as an observed rejected server write or a lost committed save.

### 10.4 Populated Lease and Configured Rights Drafts

Added **one local allow-use lease**, with `Local UI research lease` as its note.
The populated form offered **from anytime** and an end date approximately two days
ahead in this run; Save/Cancel were compact icon controls with native titles.
The service returned 202. After readback the row showed **Allow use**, **Expires in
2 days**, the note, attribution/timestamp hover and a deletion control. No deletion
was attempted. Final canonical verification found exactly one matching research
lease on the first image; it intentionally remains in the throwaway corpus.
[Form](../../../kahuna/public/js/leases/leases.html#L35),
[save/readback composition](../../../kahuna/public/js/services/api/leases.js#L95).

For rights, used the actual local category catalogue and selected **Creative
Commons**. The form exposed required **Licence / Source / Owner / Link to content**
properties. One filled text field was insufficient; supplying an offered licence
and all required text enabled Save. Checking **Restricted** revealed a required
textarea and disabled Save while blank; entering restriction text enabled it.
Cancelled the form instead of saving. Canonical rights on both research images
were unchanged, so no rights-derived metadata or category leases were applied.
[Configured form](../../../kahuna/public/js/usage-rights/usage-rights-editor.html#L35).

This local configuration had zero metadata templates and zero domain-metadata
specifications. Their controls remain source-backed; the reference does not claim
to have rendered every configured field type or applied a composite template.

### 10.5 Read-Only Presentation with Existing Information

Temporarily made `editsService.canUserEdit` return false and reloaded the current
Angular detail state, without changing the image response or account. After an
explicit wait for the populated lease, its row remained readable while lease
Add/Delete and ordinary metadata pencils were absent. Empty optional Byline was
omitted in the viewer sample. This complements the earlier important-empty-field
checks: losing editability must not erase existing useful information.

An early snapshot before the lease read completed was not credited as absence.
Restored the exact original service function and reloaded the state. This verifies
presentation under the component's read-only input, not real restricted-principal
authorization or permission revocation during a submitted operation.
[Visibility condition](../../../kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js#L541),
[lease controls](../../../kahuna/public/js/leases/leases.html#L1).

### 10.6 Keyboard and Narrow Touch-Emulated Detail

**Keyboard:** textarea Escape cancelled and Meta+Enter saved in the real local
checks. Hidden pencils did not become visible merely through Tab traversal. In
detail, tabbing from a lease control reached an **empty Title search anchor**;
Enter changed route rather than opening an editor. The route was restored. This
is a specific empty-field keyboard trap, not a claim that all metadata editing is
keyboard-inaccessible. Nonempty search links should remain search links; empty
values should not leave invisible search destinations in the tab order.
[Title branches](../../../kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html#L131),
[hover-only pencil CSS](../../../kahuna/public/stylesheets/main.css#L2410).

**Narrow view:** foregrounded detail at 412 x 850 with a verified coarse pointer.
The 130px crop rail and 300px metadata panel exceeded the available width. The
main `.image-holder` measured **0px wide**; the metadata panel began at y=851,
just below the first viewport, and document width was 583px. The screenshot showed
the rail/thumbnail but not a usable main image. Source uses fixed-width floated
panels and corresponding image margins; this was not a failed image download.
[Layout rules](../../../kahuna/public/stylesheets/main.css#L2220).

This is narrow desktop-browser touch emulation, **not** an actual phone keyboard,
native touch-entry trial or performance measurement. It establishes that shrinking
this desktop arrangement is not a viable mobile editor. It does not select Kupua's
final phone interaction model. Restored 1440px desktop width, disabled touch emulation,
restored the detail route and removed remaining temporary page-memory research data.

## 11. Preserve, Improve, Don't Copy

This is a decision aid for later design, not additional implementation authority.

| Preserve | Improve | Don't Copy |
|---|---|---|
| Important empty fields remain useful information for viewers. Existing leases/rights/metadata remain readable when editing is unavailable. | Accessible, discoverable edit affordances for mouse, keyboard and touch; omit empty search anchors. | Hover as the only way to discover editing, or removal of useful data together with write controls. |
| Ordinary shared values, italic scalar mixedness and partial list coverage mean different things. | Keep those distinctions explicit while showing the actual target count; never let mixed mean blank. | Presenting a blank batch input as evidence that every target is empty. |
| Description's per-image Add before/Add after operations preserve distinct values. | Make the selected mode and scope unmistakable, and decide its lifetime deliberately. | An unnoticed persistent mode or the source-level coupling that passes Description's option to other scalar fields. The latter was not separately exercised here. |
| Cancel, Escape and deliberate Save; useful textarea submission shortcut. | Target-bound drafts that survive appropriate SPA navigation or get an explicit discard/change-target decision. | Silent draft replacement when selection changes, or silently retargeting unsent input. |
| Server capabilities, operation eligibility and canonical readback remain distinct responsibilities. | Truthful pending, rejected, partial and uncertain outcomes with retained usable state. | Treating an all-settled success subset, closed form or stopped spinner as completion of every target. |
| A collection tree supports browsing and direct manipulation. | One searchable single/multi-image Add to Collection picker, explicit count/destination, reveal newly created nodes and revalidate dependent controls. | Vanishing multi-image metadata entry points, stale Delete controls or dragging an unselected card acting on other selected images. |
| Configured rights properties and conditional required restrictions shape the form. | Keep validation understandable and preserve before-state/cancel behavior; compose dependent outcomes explicitly. | Reporting a whole rights/template workflow complete from a final callback regardless of failed substeps. |
| Image inspection and editing should stay connected. | Recompose phone surfaces around the image and a keyboard-aware editing sheet, with reachable actions and stable scope. | Fixed desktop side rails that reduce the primary image to zero width. |

Remaining useful separately bounded evidence: configured domain fields/templates
in an isolated representative configuration, and failure/uncertainty paths that
cannot be confused with a pre-dispatch fixture. No further Kahuna phone verification
is needed for this reference; a real phone/on-screen-keyboard walkthrough belongs
to future Kupua mobile design. None is permission to change shared services, global
auth, backend safeguards, or the active scope of the editing roadmap.

## 12. Cross-Reference with Grid BDD

**Bounded source/PR comparison, 10 November 2026.** Grid's
[feature-spec epic #5074](https://github.com/guardian/grid/issues/5074) is a useful
companion inventory, explicitly still growing. Its specifications describe
user-observable cases and cite their implementation sources. Use them alongside
this presentation/UX reference; neither is evidence that the whole replacement
surface is tested or accepted.

| Work Inspected | Relevance to This Reference |
|---|---|
| [Usages specification #5129](https://github.com/guardian/grid/pull/5129/files) | Covers empty/nonempty tabs, counts, grouping/order, collapse rules, precise-time hover, replacement/derivative links, Photo Sales variants, permission-dependent cleanup and confirmation. These add a scenario-level checklist to sections 3 and 5.11, not a reason to exercise destructive workflows here. |
| [Permission/editor access #5118](https://github.com/guardian/grid/pull/5118) | Separates an editor accessing somebody else's image, a restricted user accessing somebody else's image, and an uploader accessing their own without general edit permission. Checks advertised edit authority and UI entry, not merely a mocked global flag. The PR distinguishes editor access from saving. |
| [Rights editing/templates #5134](https://github.com/guardian/grid/pull/5134) | Covers opening, saving, cancelling, required/optional properties, restrictions, persistence on reopen and template interaction. Disposable copies isolate mutations; this is a stronger future home for real permission/template acceptance than modifying our ad-hoc browser's identity. |
| [Configured category updates #5140](https://github.com/guardian/grid/pull/5140) | Exercises the newer publisher photography/illustration configuration and mapped categories. Reinforces that the category labels seen in our local form are not a universal deployment inventory. |
| [Local rights feature](../../../e2e-tests/features/rights-and-restrictions.feature) | Provides concrete cases for the configured-property/mandatory-restriction behavior and genuine uploader/general-editor distinctions discussed in sections 4 and 10. |
| [Local upload feature](../../../e2e-tests/features/upload.feature) | Separates the autosaving upload editor from the detail panel, specifies embedded-metadata visibility, existing usage instructions, job-wide apply and template read-only/restoration behavior. It explicitly says dropping a URL is ignored; no user-facing URL-import parity should be inferred from backend import support. |

### 12.1 Specification Is Not Executed Coverage

At the inspected #5129 revision, the early scenarios are tagged `@todo` and the
usages-listing Rule is also tagged `@todo`, covering its nested scenarios. The
local runner excludes that tag. This is valuable source-backed specification,
not demonstrated executable coverage for those cases. Conversely, the local
rights/upload surfaces have step definitions and actual mutation helpers. Do not
classify the whole BDD effort as either prose-only or a read-only test suite.
[Runner](../../../e2e-tests/playwright.config.ts#L6),
[rights steps](../../../e2e-tests/steps/rights-and-restrictions/right-and-restrictions.ts#L365).

A particularly useful detail: the rights save helper checks command acceptance
because the editor can close even on failure. That independently supports our
separation of closed UI, acknowledgement and observed state. Existing fixtures
also create disposable images instead of editing a shared fixture.
[Save helper](../../../e2e-tests/steps/rights-and-restrictions/right-and-restrictions.ts#L369),
[disposable image setup](../../../e2e-tests/steps/rights-and-restrictions/right-and-restrictions.ts#L701).

The review discussion on #5129 tightened a vague update scenario into a change
resulting from a user action, such as downloading. Do not interpret it as a promise
of arbitrary external backend-change delivery or add a background freshness
service merely to satisfy ambiguous wording.
[Review and revised scenario](https://github.com/guardian/grid/pull/5129).

### 12.2 How to Reuse This Work for Kupua

Reuse workflow intent and authoritative distinctions, not Kahuna-specific selectors,
icon names, awkward interaction sequences or the entire second test harness. The
existing feature-library viewer already browses specs and associated recordings;
there is no need to invent another catalogue for this reference.
[Harness/viewer guide](../../../e2e-tests/README.md).

Useful scenario candidates from our manual findings are mixed Description
prepend/append preserving each target's value; a visible single/multi collection
addition workflow with explicit targets; revealing a newly created child and
updating parent capabilities; deliberate draft behavior on selection changes;
and a rejected save leaving usable context without claiming all targets completed.
These are candidates for the owning existing suites after the relevant behavior
is selected, not approval to create a comprehensive parallel BDD suite now.

No collection-tree or general single-/multi-image textual-metadata feature file
appeared in the bounded local eight-file feature manifest inspected here. The epic
lists these areas, so our detailed matrix and hands-on findings can contribute
without duplicating the rights/upload work. This is not a claim that no other
branch or uninspected PR is addressing them.

The harness has real local OIDC/Panda account switching and permission fixtures,
which offer an eventual alternative to our presentation-only preview. Its full
stack provisioning, fixed ports, seeded configuration and mutation scenarios
must remain isolated from the operator's current stack; do not start/reseed it or
switch the shared browser's accounts merely because this cross-reference exists.
[Account helper](../../../e2e-tests/steps/utils/auth.ts#L33),
[stack/reuse guidance](../../../e2e-tests/README.md#L108).

This comparison ran no BDD tests, viewer build or service setup, and independently
certifies no CI/deployment result. No further phone investigation is selected.

## 13. Persistence Reasons and Grid Thumbnails

### 13.1 Where Kept-in-Library Explanations Come From

**No new endpoint or client policy inference is needed.** Media-api's image
formatter supplies `data.persisted = { value, reasons }`. The reasons are chosen
by `ImagePersistenceReasons` using the image and configured persistence policy;
the boolean is whether that reason list is nonempty. These are authoritative
retention facts, not a general edit/archive/delete permission flag.
[Producer](../../../media-api/app/lib/ImagePersistenceReasons.scala),
[configured producer](../../../media-api/app/lib/ImageResponse.scala#L49),
[response field](../../../media-api/app/lib/ImageResponse.scala#L229).

The server provides reason values, **not the complete English sentence**. Kahuna
maps selected values into past-participle phrases and joins them into the Library
tooltip. Its single-image explanation uses `and`; the selection toolbar unions
the selected images' explanations and uses plural/or wording. That union does not
mean each selected image has every reason. Unknown/unmapped values pass through.
[Humanizer](../../../kahuna/public/js/services/image-logic.js#L60),
[single-thumbnail owner](../../../kahuna/public/js/components/gr-archiver-status/gr-archiver-status.js#L40),
[selection explanation](../../../kahuna/public/js/components/gr-archiver/gr-archiver.js#L59).

| Server Value | Kahuna/Kupua Phrase | Server Condition |
|---|---|---|
| `persistence-identifier` | `from Picdar` | One of the configured persistence identifier keys exists. The displayed Picdar wording is the client's legacy mapping, not a separate server-supplied explanation. |
| `exports` | `cropped` | Server `hasExports` predicate. |
| `usages` | `used` | Server `hasUsages` predicate. |
| `archived` | `archived` | Explicit user-metadata archived value is true. |
| `photographer-category` | `categorised as photographer` | Effective rights have the server's photographer type. |
| `illustrator-category` | `categorised as illustrator` | Effective rights have the server's illustrator type. |
| `commissioned-agency` | `categorised as agency commissioned` | Effective rights have the commissioned-agency type. |
| `leases` | `leased` | Lease list is nonempty; **not only active allow-use leases**. |
| `persisted-collection` | `added to a persisted collection` | Server collection-persistence policy matches. Not every configured collection deployment necessarily has the same policy. |
| `photoshoot` | `added to a photoshoot` | A photoshoot assignment is present. |
| `labeled` | `labeled` | User labels are nonempty. The wire spelling is `labeled`. |
| `edited` | `edited` | The user metadata-override object differs from empty image metadata; not merely a root timestamp change. |

Kupua already retains the server pair in its API enrichment and has the same
humanization map/fallback in `ImageGrid`. The current thumbnail renders the kept
explanation from that data. Reuse this knowledge for a second Library consumer
rather than inventing another endpoint, permissions cache or client retention
calculation. Sharing the existing presenter when another consumer needs it is
reasonable; this research does not perform that refactor.
[Retention](../../src/dal/grid-api-search-adapter.ts#L101),
[existing presenter](../../src/components/ImageGrid.tsx#L105),
[rendered tooltip](../../src/components/ImageGrid.tsx#L508).

A read-only local sample returned `leases`, `persisted-collection`, `labeled`
and `edited`; the thumbnail showed **Kept in Library because the image has been
leased, added to a persisted collection, labeled and edited.** This confirms the
data-to-wording path without revealing image identity or changing metadata.

### 13.2 Thumbnail Information in Kahuna

This is the standard search-result thumbnail, not the upload job card, detail
crop rail, results toolbar or a proposed Kupua layout. The shared preview can also
receive context-specific transcluded actions. Unless marked as browser-observed
below, conditional variants are current-source findings, not fabricated live data.
[Preview template](../../../kahuna/public/js/preview/image.html),
[preview owner](../../../kahuna/public/js/preview/image.js),
[state derivation](../../../kahuna/public/js/image/service.js#L26).

| Information | Presentation / Condition / Hover |
|---|---|
| Description/title | Description preferred, then Title, then a height-preserving blank. Tooltip includes that text plus By/Credit, each falling back to `[none]`. Visible text truncates. |
| Labels | Compact blue search pills, with a fixed-height clipped row. This compact renderer has **no remove control**, despite the surrounding component accepting add/remove callbacks. |
| Collections | Coloured leaf-description pills. Full path appears in `Click to open collection: {path}` hover; clicking searches that canonical collection. The thumbnail collection anchor does not wire the same explicit modifier handler as metadata's collection link. |
| Dates | Uploaded date normally; Taken date when stored ordering includes `taken`, with `[none]` when absent. Hover supplies Uploaded/Taken with seconds. |
| Crops/exports | Crop icon when `exports` is nonempty; native tooltip `this image has crops`. It reports existence, not a create-crop action. |
| Print/digital use | Separate print/digital icons when corresponding usages exist. Recent use gets a warning highlight and `RECENTLY` wording in hover, based on the recent-usage owner. |
| No rights | Red warning icon, `No current rights to use this image!`; no lease-tint override in that template branch. |
| Pay / over quota | Pay symbol or rising-graph icon, explanatory hover. Active allow-use leases can switch the styling to leased and prefix the hover with `Leased, but:`. |
| Restrictions | Flag icon, `Restrictions: {text}`, with leased styling/prefix where applicable. Initial flag selection prioritizes restriction presentation; do not equate it to raw cost alone. |
| Free | No corresponding positive/free cost icon in this template switch. Absence of a warning is not itself a write capability. |
| Syndication | Coloured status icon and explanation when status is not unsuitable. It is informational: the icon template contains no publish/send command. |
| Library | Kept, explicitly archived or available-to-add presentation, with interactive states described below. Selection mode uses a separate read-only branch. |
| Photo Sales | Configured/permission-dependent presence marker for syndication usage or Capture ingest. Published/unpublished marker variant depends on domain metadata, defaulting to published. This is not a send action. |
| Staff/agency classification | Staff-photographer classes produce a thick blue image border and owned-image description prefix. An agency-pick class is also assigned; class assignment alone is not proof of an effective style in every deployment. |
| Potentially graphic | Configured blur/text warning; CSS says `POTENTIALLY GRAPHIC IMAGE (hover to reveal)` and reveals on hover. This is separate from rights/selection warning overlays. |
| Selected warning overlay | Only when `enableWarningFlags`, this image is selected and a warning condition applies. Alert, restriction warning and active-allow-lease presentation use configured copy. While shown, the ordinary labels/collections/description info block is withheld. |
| Selection / seen | Selected border and checkbox; independently, a locally seen result is dimmed. Neither means the image was edited, archived or viewed by another user. |

Sources for compact pills and visual conditions:
[label renderer](../../../kahuna/public/js/edits/list-editor-compact.html),
[preview conditions](../../../kahuna/public/js/preview/image.js#L82),
[graphic CSS](../../../kahuna/public/stylesheets/main.css#L1708),
[staff border/info styling](../../../kahuna/public/stylesheets/main.css#L1773),
[syndication indicator](../../../kahuna/public/js/components/gr-syndication-icon/gr-syndication-icon.html).

### 13.3 Thumbnail and Grid-Wrapper Actions

| Action | Kahuna Behavior and Limits |
|---|---|
| Open detail | Image anchor opens detail outside selection mode. Once selection mode is active, image clicks toggle selection; Shift extends the loaded selection range. |
| Pop out | Hover action with native `Pop out` title, opening the full image page in a new tab (`target=_blank`, `noopener`). Remains in selection mode. |
| Quick crop | Hover crop link when server-derived `isValid` is true, outside selection mode. Opens the crop editor; it does not create an export merely by opening. |
| Add label | Hover Plus opens the compact comma/suggestion form on that image. It has Close and Save, and hides the existing compact label renderer while inputting. Not offered in selection mode. No per-pill removal is provided by this thumbnail renderer. |
| Search label/collection | Label value searches with its modifier handler outside selection mode; labels become plain spans in selection mode. Collection pills remain search anchors. Do not interpret either as adding membership or applying the label. |
| Add/Remove from Library | Outside selection mode, Add requires the root archive relation and appropriate image state; explicitly archived images expose Remove. Pending disables the command, failures alert. Kept images only explain reasons. The Remove branch is not guarded identically to Add in the template; backend authorization remains required. |
| Select/range select | Parent-wrapper checkbox enters selection; subsequent image clicks toggle and Shift adds a range in the loaded result list. This is not equivalent to Kupua's arbitrary-position range engine. |
| Drag image(s) | Existing Grid drag payloads support collection drops. Kahuna's global selection drag can override an unselected drag origin with the selected set, as witnessed in section 9. |
| Mark as seen | Parent grid transcludes **Mark all images until this point as seen**, outside selection mode. It stores a query-keyed upload-time cutoff in localStorage, then dims images whose upload time is at/before it. It is **not** an exact row-prefix operation in every sort, per-image server history or an audit trail. |

[Grid wrapper/transclusion](../../../kahuna/public/js/search/results.html#L165),
[selection behavior](../../../kahuna/public/js/search/results.js#L795),
[seen cutoff](../../../kahuna/public/js/search/results.js#L545),
[seen/hover CSS](../../../kahuna/public/stylesheets/main.css#L1281),
[Library template](../../../kahuna/public/js/components/gr-archiver-status/gr-archiver-status.html),
[Library command owner](../../../kahuna/public/js/components/gr-archiver-status/gr-archiver-status.js).

The ordinary preview does not have direct Delete-image, Download, usage-cleanup,
rights-edit or collection-add buttons. Those belong to other surfaces. An icon
reporting existing crops/usages/syndication/Photo Sales is not a hidden command.

**Selection-mode change:** the clean local browser check found zero thumbnail
label-add controls, label-search anchors, mark-seen controls, Library buttons or
Library reason-title attributes while selection was active; Pop out remained.
In particular, Kahuna's read-only Library branch loses the kept-reason hover,
not just the write buttons. This is not necessarily behavior worth copying.

### 13.4 Current Standard Kupua Grid Comparison

This compares the inspected **standard Grid cell**. Image-only/Justified density
intentionally renders a different amount of metadata; fewer controls there are
not automatically defects. It is not a claim about every route, shortcut or native
browser context menu.
[Current renderer](../../src/components/ImageGrid.tsx#L255).

| Surface | Kupua Status / Implication |
|---|---|
| Description/byline/credit hover, dates | Present. Date presentation is shared code rather than the old stored-string predicate. |
| Label and collection search pills | Present. Thumbnail label **addition** is absent; use the existing label operation/draft owner when this entry point is selected, not a second label editor implementation. |
| Print/digital, cost, syndication | Present, with current server enrichment/derivation. Exact hover wording and presentation differ; this inventory does not demand pixel identity. |
| Persistence explanation | Present from server reasons, but one kept-style padlock for persisted images. No thumbnail Add/Remove command or separate explicit-archive icon state here. This is a concrete Step-7 integration surface. |
| Existing-crops indicator | Not rendered in this cell. Raw API image data retains exports; validate that consumer contract when adding the existence indicator, rather than commissioning a new endpoint by default. |
| Quick crop entry | No equivalent thumbnail crop action in this renderer. Detail's crop mock exists; a thumbnail entry can reuse that route/owner when selected. Entry and permission-aware saving remain distinct. |
| Pop out | No equivalent dedicated full-image new-tab affordance found in this renderer. Middle-click explicitly opens fullscreen preview, which is useful but different. Do not silently replace that existing gesture. |
| Mark as seen / dimmed seen state | No equivalent found in the inspected grid/actions and targeted source search. Decide whether the browsing workflow is valuable before copying Kahuna's upload-cutoff implementation. |
| Selected warning overlay | No counterpart to the configured Kahuna selected-image tint/banner in this renderer. This is configuration-dependent; the local Kahuna sample had warning overlays disabled. It is not a blanket Step-7 gate. |
| Photo Sales marker | No corresponding marker in this renderer; configuration-dependent parity question belonging with the relevant family, not a new partner-publication control. |
| Graphic warning / borders | Already present, including controlled reveal and configured classification styling. Do not count these as wholly missing. |
| Drag/selection | Already present. Importantly, Kupua already drags the selected set **only if the dragged card is selected**; an unselected card carries itself. This is the improved scope rule proposed after the Kahuna exercise. Its minimal payload is not the complete external Kahuna embedding contract. |

[Current badges and pills](../../src/components/ImageGrid.tsx#L415),
[borders](../../src/lib/image-borders.ts),
[drag-scope rule](../../src/components/ImageGrid.tsx#L978),
[click/fullscreen behavior](../../src/components/ImageGrid.tsx#L1075),
[API image retention](../../src/dal/grid-api-search-adapter.ts#L52).

Prioritize the existing command families: label entry and explicit Library
actions on appropriate targets, then useful navigation/status gaps such as quick
crop, pop-out and crops existence as separately selected UI work. Seen-state,
configured warning overlays and Photo Sales variants require an explicit product
choice; they should not become an undifferentiated list of mandatory buttons.
Keep actions distinguishable from indicators and available without hover where
keyboard/touch needs it, without shrinking existing controls or adding re-render
work to every scroll frame.

Cross-density badge proposals and the selected always-inline editing model have a
separate [UI decisions guide](gradually-growing-teeth.editing-ui-decisions.md).
The field-task alternative was rejected; inline controls are integrated in Kupua,
with new saves disconnected. Thumbnail badge proposals remain unimplemented and
do not change the behavior inventoried here.

### 13.5 Evidence Limits and Browser Cleanup

Read the preview, parent wrapper/handlers, Library component, compact label
template, server persistence producer and current Kupua cell/handlers. Earlier
search-results research is context, not a new whole-app audit. The browser pass
confirmed the local reason list/wording, hover Pop out/seen/label entry and the
selection-mode changes above. Crop eligibility variants, usages, Photo Sales,
warning overlays and Add/Remove Library branches were not manufactured just to
make every icon appear.

One unsent inline-label probe entered text, switched selection mode and returned
to an empty reappearing form. Its final pointer Close action was obstructed, so
that probe is not credited as a successful save/cancel reliability test or a
diagnosis of the exact layout cause. No Save was activated. Reload cleared the
unsent UI; a separate clean selection-mode check then completed and selection
was cleared. No thumbnail label, archive, download, crop or seen-state mutation
was executed, no temporary instrumentation remains, and no further phone check
was performed.