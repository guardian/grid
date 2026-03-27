# Kupua — Metadata Display & Editing Plan

> **Created:** 2026-03-27
> **Status:** Research complete — ready for discussion.
> **Purpose:** Design plan for the metadata panel (`ImageMetadata.tsx`), covering
> display logic, click-to-search, field visibility, multi-selection reconciliation,
> and the future editing UX. Based on thorough analysis of kahuna's
> `gr-image-metadata` component (~1066 lines of template, ~665 lines of JS).

---

## Table of Contents

1. [Kahuna Reference — How It Works Today](#kahuna-reference--how-it-works-today)
2. [Display Rules — The Decision Tree](#display-rules--the-decision-tree)
3. [Field Visibility Rules](#field-visibility-rules)
4. [Click-to-Search](#click-to-search)
5. [The Edit Button — Hover-to-Reveal](#the-edit-button--hover-to-reveal)
6. [Multi-Selection Reconciliation](#multi-selection-reconciliation)
7. [Field Types and Edit UI](#field-types-and-edit-ui)
8. [List Fields — The Pill Pattern](#list-fields--the-pill-pattern)
9. [Field Ordering](#field-ordering)
10. [What Kupua Should Build (Phased)](#what-kupua-should-build-phased)
11. [Open Questions](#open-questions)

---

## Kahuna Reference — How It Works Today

### Architecture

The metadata panel is `<gr-image-metadata>`, a single AngularJS component that
handles **both** single-image and multi-image selection. It receives:
- `grImages` — an Immutable.js List of selected images
- `grUserCanEdit` — boolean (resolved via `editsService.canUserEdit(image)`,
  which checks whether the image's HATEOAS response includes an `edits` link)

Used in two contexts:
1. **Image detail view** (`image-editor.html`) — always 1 image
2. **Info panel** (`gr-info-panel.html`) — N selected images from search results

Same component, both contexts. Same UX patterns.

### Source files

| File | Lines | Role |
|---|---|---|
| `gr-image-metadata.html` | 1066 | Template — all display/edit logic |
| `gr-image-metadata.js` | 665 | Controller — data reconciliation, edit handlers |
| `gr-image-metadata.css` | 36 | Minimal component CSS (location form layout) |
| `main.css` (lines ~2270–2370) | ~100 | Shared styles (edit button, multiple, empty, metadata-line) |
| `image-list.js` | 83 | `getSetOfProperties()` — multi-image reconciliation engine |
| `edits/service.js` | 345 | Edit API: `canUserEdit()`, `update()`, `batchUpdateMetadataField()` |
| `search/query-filter.js` | 84 | `searchWithModifiers` — click/Shift+click/Alt+click on values |
| `edits/metadataDiff.js` | 32 | Diff between original and edited metadata |
| `edits/list-editor-info-panel.html` | 24 | Pill-based list fields (keywords, people, labels) |

---

## Display Rules — The Decision Tree

Every field follows a consistent 4-way branch. Kahuna is remarkably
disciplined about this — every field in the 1066-line template follows
the same pattern:

```
Field has value(s) across selection?
├── Multiple distinct values?
│   ├── userCanEdit
│   │   → "Multiple [fields] (click ✎ to edit all)" [italic]
│   └── !userCanEdit
│       → "Multiple [fields]" [italic]
└── Single (or zero) values?
    ├── Has value
    │   → clickable search link (value text is an <a>)
    └── No value?
        ├── userCanEdit
        │   → "Unknown (click ✎ to add)" [grey]
        └── !userCanEdit
            → "Unknown" [grey]
            (or entire field hidden — see Visibility below)
```

### Visual treatments

| State | Kahuna CSS | Appearance | Kupua equivalent |
|---|---|---|---|
| **Multiple values** | `.image-info--multiple` | `font-style: italic` | `italic text-grid-text-muted` |
| **Empty/unknown** | `.editable-empty` | `color: #aaa` | `text-grid-text-dim` |
| **Normal value** | `.metadata-line__info` | `color: #eee` | `text-grid-text` (current `text-xs`) |
| **Field label** | `.metadata-line__key` | `color: #999` | `text-grid-text-dim` (current `text-xs`) |
| **"edit all" emphasis** | inline `<strong>` | bold "all" | `font-semibold` |

---

## Field Visibility Rules

Kahuna's visibility logic follows a principle: **don't show empty fields
to users who can't fill them.** This is sensible — an empty "By" field
means nothing to a non-editor. To an editor, it's an invitation to act.

| Field | Visible when |
|---|---|
| Title | Always (even if empty — it's core metadata) |
| Description | Always |
| Special instructions | Always (also shows `usageInstructions` if present) |
| Date taken | Always |
| **By (byline)** | `rawMetadata.byline \|\| userCanEdit` — **hidden if empty AND non-editor** |
| Credit | Always (shows "Unknown" if empty) |
| **Copyright** | `rawMetadata.copyright \|\| userCanEdit` — **hidden if empty AND non-editor** |
| **Location** | Any sub-field has data, OR any has multiple values, OR userCanEdit |
| Uploaded | Single image only |
| Uploader | Single image, AND not multiple distinct uploaders |
| Filename | Single image, AND has a filename |
| **Subjects** | Any selected image has subjects |
| **People** | `userCanEdit \|\| anyImageHasPeople` |
| **Keywords** | `userCanEdit \|\| anyImageHasKeywords` |
| Additional metadata | Single image only, AND at least one non-core field has a value |
| Domain metadata | Single image only. Section shown if `userCanEdit` OR fields have values |
| Collections | Single image only |
| Labels | Always (editable by all) |
| Photoshoot | Always |
| Syndication Rights | Single image only |

### For kupua's current state

Kupua currently has no auth — all users are effectively non-editors.
Adopting kahuna's visibility rules means:
- By, Copyright, Location: hidden when empty (cleaner display)
- Subjects, People, Keywords: hidden when no data
- This naturally declutters the panel vs. showing "Unknown" for everything

When `GridApiDataSource` arrives (Phase 3) and auth is wired up, the
`userCanEdit` flag flips and empty-but-editable fields appear.

---

## Click-to-Search

Every metadata value in kahuna is a clickable link that launches a search.
This is **extremely useful** — it's the primary discovery mechanism.

### Modifier behaviour

Kahuna's `searchWithModifiers` (`search/query-filter.js`):

| Action | Result |
|---|---|
| **Click** | Replaces query with `field:"value"` |
| **Shift+click** | Appends to existing query: `existing query field:"value"` |
| **Alt+click** | Excludes: `existing query -field:"value"` |

Kupua already has this exact pattern in ImageTable cell clicks (via
`upsertFieldTerm` in `cql-query-edit.ts`). The metadata panel should
use the same mechanism.

### What this means for display

Values must be rendered as interactive elements (links or buttons), not
plain text. The current `ImageMetadata.tsx` renders values as plain `<dd>`
text. This needs to change.

### Mobile caveat

Kahuna's hover-to-edit pattern means clicks on values are always "search"
(not "edit"). But on touch devices there's no hover to reveal ✎, so
editing is impossible without the edit button visible. Kupua is
desktop-first; this is an acknowledged trade-off (same as kahuna).

---

## The Edit Button — Hover-to-Reveal

Kahuna's editing UX relies on a ✎ button that's **invisible by default**
and **appears on hover** over the field row:

```css
.image-info__edit {
    display: none;
    position: absolute;
    top: 0; right: 0;
    line-height: 21px; width: 21px;
    border-radius: 50%;
    color: #222;
    background-color: white;
}
.image-info__wrap:hover .image-info__edit {
    display: block;
}
```

This creates a clean separation:
- **Click on value text** → navigates to search
- **Click on ✎** → opens inline editor

Without hover-reveal, clicks would be ambiguous — is the user trying to
search or edit? The hover-reveal solves this elegantly on desktop.

### Kupua approach

Phase 1 (read-only): no ✎ button. All values are search links.
Phase 3+ (with GridApiDataSource + auth): add the hover-to-reveal ✎.
The `userCanEdit` flag gates whether ✎ is rendered at all.

---

## Multi-Selection Reconciliation

### The rawMetadata / displayMetadata split

Kahuna computes **two** metadata objects from the selection
(`gr-image-metadata.js` lines 474–501):

**`rawMetadata`** — for detecting multiplicity:

```javascript
function rawMetadata() {
    return selectedMetadata().map((values) => {
        switch (values.size) {
            case 0:  return undefined;  // no images have this field
            case 1:  return values.first();  // all images agree
            default: return Array.from(values);  // multiple distinct values
        }
    }).toObject();
}
```

**`displayMetadata`** — for the editable model:

```javascript
function displayMetadata() {
    return selectedMetadata().map((values) => {
        switch (values.size) {
            case 1:  return values.first();  // unanimous — show the value
            default: return undefined;  // contested or empty — show nothing
        }
    }).toObject();
}
```

### How the template uses both

```
ctrl.hasMultipleValues(ctrl.rawMetadata.title)
  → true when rawMetadata.title is an Array with length > 1

ctrl.metadata.title  (this IS displayMetadata)
  → the unanimous value, or undefined
```

The template checks `rawMetadata` for the "Multiple X" italic treatment,
and uses `displayMetadata` for the actual rendered/editable value.

### The reconciliation engine: `getSetOfProperties()`

`imageList.getSetOfProperties(objects)` (`image-list.js` line 60):

Takes an Immutable.js List of metadata objects (one per selected image).
For each key that appears in any object, collects all values into a Set.
Returns `Map<key, Set<values>>`.

This is the core merge — simple set union per field.

### Kupua approach

Defer until multi-selection is implemented (Phase 4). The
`ImageMetadata.tsx` component currently takes a single `Image` prop.
When multi-selection arrives, the caller (`FocusedImageMetadata` in
`search.tsx`) can compute `rawMetadata` and `displayMetadata` from
the selected images and pass them as props. The component's internal
display logic then follows the decision tree above.

**Key insight:** The reconciliation is a pure data transform — no
component architecture changes needed. The `ImageMetadata` component
just needs to accept `rawMetadata` + `displayMetadata` + `userCanEdit`
instead of (or in addition to) a single `Image`.

---

## Field Types and Edit UI

Kahuna uses `angular-xeditable` for inline editing. Each editable field
has a distinct edit control. Kupua will need React equivalents.

| Field | Kahuna edit control | Display format | Notes |
|---|---|---|---|
| Title | `editable-text` (inline input) | Search link | — |
| Description | `editable-textarea` + `msd-elastic` (auto-grow) | Plain text (not a search link in kahuna) | Overwrite/Prepend/Append radio for multi-selection |
| Special instructions | `editable-textarea` + `msd-elastic` | Plain text | Also shows `usageInstructions` (separate read-only field) above |
| By (byline) | `editable-text` | Search link | — |
| Credit | `editable-text` + **typeahead** (ES aggregation) | Search link | Autocomplete from ES `metadataSearch` |
| Copyright | `editable-text` | Search link | — |
| Location | **grouped form** (4 fields: sublocation, city, state, country) | Comma-separated search links per part | Single ✎ opens all 4 simultaneously. Each sub-field can independently show "(Multiple cities)" etc. |
| Date taken | `editable-datetime-local` | Formatted date (`d MMM yyyy, HH:mm`) | Datetime picker |
| Image type | `editable-select` | Plain text | Dropdown from `validImageTypes` config |
| Subjects | Read-only pill list | Search link pills | Not editable via ✎ |
| People | Pill list + add button | Search link pills with × | `ui-list-editor-info-panel` |
| Keywords | Pill list + add button | Search link pills with × | Same pattern as People |
| Labels | Pill list + add button | Search link pills with × | Labels are Grid-specific (not IPTC) |

### Textarea keyboard shortcuts

For Description and Special Instructions:
- **Escape** → cancel edit
- **Ctrl/Cmd+Enter** → save

Implemented via a global `keydown` listener that detects `textarea` target
and form name (`descriptionEditForm`, `specialInstructionsEditForm`), then
clicks the appropriate Cancel/Save button.

### Credit typeahead

```javascript
ctrl.credits = function (searchText) {
    return ctrl.metadataSearch('credit', searchText);
};
ctrl.metadataSearch = (field, q) => {
    return mediaApi.metadataSearch(field, {q}).then(resource => {
        return resource.data.map(d => d.key);
    });
};
```

Kupua already has aggregation data from facet filters. Could reuse
`getAggregation()` for inline autocomplete — same ES endpoint,
different context. Nice-to-have, not essential for Phase 1.

---

## List Fields — The Pill Pattern

Keywords, People, Subjects, and Labels all use a pill-based UI via
`ui-list-editor-info-panel`:

### Display

Each value is a pill: `[value text] [×]`

- Pill text is a search link (click → search, Shift+click → AND,
  Alt+click → exclude)
- × button removes the value from the image(s)
- For multi-selection: if a value exists on only **some** images, the
  pill gets a distinct style (`element--partial`) and a "library_add"
  icon button to apply it to all selected images

### Adding

A + button in the section header opens a text input. On save, the
value is added to all selected images via `addXToImages()`.

### Removing

× button calls `removeXFromImages()` — removes from all selected
images that have it.

### Kupua approach

Phase 1 (read-only): render as comma-separated search links (current
approach) or as pill-shaped `<button>` elements with click-to-search.
No add/remove — that requires write API.

Phase 3+ (with auth): add the + / × buttons. The pill pattern maps
cleanly to React — a `<div className="flex flex-wrap gap-1">` with
individual pill buttons.

---

## Field Ordering

Kahuna's field order is deliberate and not alphabetical. It reflects
operational priority — editors need to see usage restrictions first:

1. **Metadata templates** (if configured, editor-only)
2. **Rights & restrictions** (usage rights category)
3. **Image type** (if configured)
4. **Leases** (if editor or leases exist)
5. **Title**
6. **Description**
7. **Special instructions**
8. **Date taken**
9. **By (byline)**
10. **Credit**
11. **Location** (sublocation, city, state, country)
12. **Copyright**
13. **Uploaded** (date) — single image only
14. **Uploader** — single image only
15. **Filename** — single image only
16. **Subjects**
17. **People**
18. **Additional metadata** (collapsible section, single image only)
19. **Domain metadata** (collapsible section(s), single image only)
20. **Collections** (single image only)
21. **Labels**
22. **Photoshoot**
23. **Syndication Rights** (single image only)
24. **Keywords** (section with heading)
25. **Crops** (single image only)

### Kupua field order

For Phase 1 (read-only, no auth), field ordering follows kahuna closely.
Fields are grouped into **sections** separated by solid `#565656` dividers
(matching kahuna's `image-info__group` border-bottom). These dividers are
**orientation landmarks** — they appear at consistent vertical positions
between images, so users always know where they are in the panel.

Fields marked (stacked) render label-above-value; all others render
inline (label left 30%, value right 70%).

**Section 1 — Rights & type** (inline)
1. **Category** (usage rights)
2. **Image type**

**Section 2 — Title & Description** (stacked)
3. **Title**
4. **Description**

**Section 3 — Special instructions** (stacked)
5. **Special instructions** (hidden if empty)

**Section 4 — Core metadata** (inline)
6. **Taken on** (date taken)
7. **By** (hidden if empty)
8. **Credit**
9. **Location** (hidden if no data)
10. **Copyright** (hidden if empty)
11. **Source**
12. **Uploaded**
13. **Uploader**
14. **Suppliers reference** (hidden if empty)
15. **Subjects** (hidden if empty)
16. **People** (hidden if empty)

**Section 5 — Keywords** (stacked)
17. **Keywords** (hidden if empty)

**Section 6 — Technical** (inline)
18. **Dimensions**
19. **File size**
20. **File type**

**Section 7 — Identity** (inline)
21. **Image ID**

Rights/leases/collections/labels/domain metadata are deferred — they
need the Grid API or are not in the ES mapping.

---

## What Kupua Should Build (Phased)

### Phase 1 — Display improvements (immediate, read-only) ✅ DONE

**No new dependencies. No write API needed.**

All Phase 1 items implemented in `ImageMetadata.tsx`:

1. ✅ **Values as search links.** Click a value → navigate to
   `field:"value"` search. Shift+click → append. Alt+click → exclude.
   Uses `upsertFieldTerm()` from `cql-query-edit.ts`. Persistent
   underline (`decoration-[#999]`) matches kahuna's link styling.

2. ✅ **Field visibility rules.** Empty fields hidden (all users are
   non-editors). By, Copyright, Location, Special Instructions, Suppliers
   Reference, Subjects, People, Keywords: hidden when empty.

3. ✅ **Field ordering & section grouping.** Matches kahuna's section
   structure with solid `#565656` dividers as orientation landmarks.
   Title/Description/Special instructions use stacked layout (label
   above value); most other fields use inline layout (30%/70%).
   See [Kupua field order](#kupua-field-order) above.

4. **"Unknown" for empty-but-shown fields.** Deferred — currently all
   empty fields are simply hidden (no editors). When `userCanEdit`
   arrives (Phase 3), empty-but-editable fields will show "Unknown".

### Phase 3 — Editing (after GridApiDataSource + auth)

1. **`userCanEdit` flag.** Derived from the Grid API's HATEOAS `edits`
   link (same as kahuna). Propagated to `ImageMetadata` as a prop.

2. **Hover-to-reveal ✎ button.** `display: none` by default, `group-hover`
   via Tailwind (`group-hover:block`). Opens inline editor on click.

3. **Inline editing.** React equivalents of angular-xeditable:
   - Text fields: `<input>` that replaces the display text, with
     Save/Cancel buttons.
   - Textarea fields: `<textarea>` with auto-grow, Escape/Cmd+Enter.
   - Select fields: `<select>` dropdown.
   - Datetime fields: native `<input type="datetime-local">`.

4. **Empty-but-editable fields visible.** When `userCanEdit`, By,
   Copyright, Location etc. appear even when empty, with
   "Unknown (click ✎ to add)" placeholder.

5. **Credit typeahead.** Reuse aggregation infrastructure for
   autocomplete suggestions.

### Phase 4 — Multi-selection

1. **`rawMetadata` / `displayMetadata` split.** Compute from selected
   images, pass to `ImageMetadata` as props.

2. **"Multiple [X]" italic treatment.** When `rawMetadata[field]` is an
   array, show italic message instead of value.

3. **"click ✎ to edit all" for editors.** Editing with multiple values
   writes to all selected images.

4. **Description overwrite/prepend/append radio.** Appears when editing
   Description across images with different values.

5. **Pill partial indicators.** For list fields (keywords, people,
   labels), pills that exist on only some selected images get a
   distinct style and an "apply to all" button.

---

## Open Questions

1. **Should we use the field registry for metadata display?** The field
   registry (`field-registry.ts`) already has `label`, `cqlKey`,
   `accessor`, `formatter` per field. `ImageMetadata.tsx` currently
   hardcodes field display. Using the registry would mean the metadata
   panel auto-updates when fields are added — but it also couples the
   panel to the table column system. The field registry has display
   concerns (width, hidden, cell renderer) that don't apply to the
   metadata panel. **Tentative answer:** keep them separate. The
   metadata panel has its own ordering, visibility, and display rules
   that differ from table columns. Shared identity (field IDs, CQL
   keys) is fine; shared rendering is not.

2. **How to handle location as a compound field?** Kahuna edits all four
   location sub-fields (sublocation, city, state, country) as a single
   grouped form. In display, they're comma-separated search links. Our
   current `formatLocation()` joins them into one string. For
   click-to-search, each sub-part needs to be an individual link
   targeting the correct CQL field (`location:`, `city:`, `state:`,
   `country:`). This means unpacking the compound display.

3. **Pill vs. comma-separated for list fields?** ~~Kahuna uses pills
   (with × buttons for editing). For read-only display, pills are
   heavier than comma-separated links. Consider: comma-separated for
   read-only (Phase 1), pills when editing arrives (Phase 3).~~
   **Resolved:** pills from the start. They're visually clearer (no
   ambiguity with multi-word values), reusable in both the metadata
   panel (`SearchPill`) and the table view (`DataSearchPill`), and the
   overhead is negligible. The shared `SearchPill.tsx` component handles
   both contexts. When editing arrives, pills gain × buttons naturally.

4. **Right panel width and metadata density.** The right panel defaults
    to 320px (vs. kahuna's fixed 290px). Metadata should be comfortable
    at 200–500px. **Resolved:** hybrid layout matching kahuna. Title,
    Description, Special instructions, and Keywords use **stacked** layout
    (label above, value below) — same as kahuna's `image-info__wrap`
    block flow. All other fields use **inline** layout (label left 30%,
    value right 70%) — same as kahuna's `image-info__group--dl__key--panel`
    / `__value--panel`. This works well at all panel widths.

