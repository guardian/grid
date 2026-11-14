# Kahuna App-Wide UI Constants

> Generated: 3 May 2026. Research-only — no proposals, no kupua equivalents.
> Sources: `kahuna/public/js/`, `kahuna/public/stylesheets/main.css`.

## Consistency caveat

All three patterns below are **mostly consistent** but not perfectly uniform:
- The destructive-confirm pattern has three distinct tiers and one anomalous case (`button--confirm-delete` used without `gr-confirm-delete`).
- The colour vocabulary is genuinely centralised in `main.css` for cost/validity; lease colours are in a component-local file and partially override the central ones.
- The ✎ edit-button affordance is consistent across the metadata panel but uses a different (simpler) pattern in the upload / search-results editor context.

---

## Section 1 — Destructive-action confirmation pattern

### 1.1 `gr-confirm-delete` — the base component

Source: `kahuna/public/js/components/gr-confirm-delete/gr-confirm-delete.js` and `.css`.

Single `<button>` that changes text and appearance on first click, executes the action on second click, then resets after 5 seconds if no second click.

**Visual states:**

| State | CSS class | Background | Hover background | Label text |
|---|---|---|---|---|
| Default | `.gr-confirm-delete` | inherits (transparent/none) | `#666666` (grey) | `grLabel` attr, default `"Delete"` |
| After first click | `.gr-confirm-delete--confirm` | `red` | `#960000` (dark red) | `grConfirm` attr, default `"Confirm delete"` |

**Timeout:** 5 seconds after first click, the button reverts and the action handler is unbound — `gr-confirm-delete.js:28-31`.

**Customisable:** `gr-label` and `gr-confirm` attrs override both text states — `gr-confirm-delete.js:22-23`.

### 1.2 Tier table

| Tier | Mechanism | Used for |
|---|---|---|
| **A — Two-click only** | `gr-confirm-delete` alone | Delete image (`gr-delete-image.js:54-56`); Undelete image (`gr-un-delete-image.js:48-50`); Delete individual lease (`leases.html:157-159`); Delete collection node (`gr-collections-panel-node.html:37-41`); Delete upload job item (`upload-jobs.html:35-38`) |
| **B — Two-click + browser `prompt("type DELETE")`** | `gr-confirm-delete` wraps the trigger button; `$window.prompt()` fires inside the `gr-on-confirm` callback | Delete ALL crops (`gr-delete-crops.js:23-35` and `:57-62`); Delete ALL usages (`gr-delete-usages.js:39-45` and `gr-delete-usages.html:1-5`) |
| **C — Red `button--confirm-delete` without `gr-confirm-delete`** | A plain `<button class="button--confirm-delete">` is revealed by setting `ctrl.confirmDelete = true` via a separate "apply-all" button; clicking it executes immediately (no second-click gate) | Batch-remove ALL leases in upload job (`leases.html:24-27`); Batch-remove ALL keywords/labels in upload job (`edits/list-editor-upload.html:10-12`); Batch-remove ALL collections in image editor (`edits/image-editor.html:223-232`) |

### 1.3 Notes on Tier C

Tier C is **not** `gr-confirm-delete`. It is a bare `<button>` that becomes visible only after an intermediate "apply all" step (`⇔` button) sets `ctrl.confirmDelete = true`. There is no timeout and no second-click gate within the red button itself — clicking it fires the action immediately. The red background and ⚠ icon provide the only visual caution. This pattern is used exclusively in the **upload flow** for batch operations, not in the image detail view.

`button--confirm-delete` CSS: `main.css:531-541` — `background: red; :hover background: #960000`.

### 1.4 No other confirm patterns found

No modal dialogs, no inline "Are you sure?" text fields (other than the browser `prompt()`), no AngularJS `$uibModal` usage for destructive confirms. The three tiers above are exhaustive.

---

## Section 2 — Semantic colour vocabulary

All cost/validity colours are defined in `kahuna/public/stylesheets/main.css` as flat class rules (no CSS custom properties / SCSS variables). Lease access colours are in the component-local `kahuna/public/js/leases/leases.css`.

### 2.1 Validity / warning states

| Semantic role | Visual treatment | Hex | CSS class | Used on (file:line) |
|---|---|---|---|---|
| Invalid / unusable | Solid red background, white text; red ▼ pointer above element | `red` (= `#ff0000`) | `.validity--invalid` | `gr-metadata-validity.html:2`, `main.css:1353` |
| Warning / restricted | Solid orange background; orange ▼ pointer | `orange` (= `#ffa500`) | `.validity--warning` | `gr-metadata-validity.html:5`, `main.css:1359` |
| Leased-override (allow-use lease active, overriding invalid state) | Solid teal background; teal ▼ pointer | `teal` (= `#008080`) | `.validity--leased` | `gr-metadata-validity.html:2`, `main.css:1363` |

The ▼ pointer (`::before` pseudo-element) is added by `.validity--point-up` (applied alongside the state class) and uses `border-bottom-color` matching each state: `main.css:1395-1405`.

### 2.2 Cost category badges

Used on search results grid (preview bottom bar), crop view, and info panel. All share the same CSS classes.

| Semantic role | Visual treatment | Hex | CSS class | Used on (file:line) |
|---|---|---|---|---|
| Free | Solid green background | `green` (= `#008000`) | `.cost--free` | `gr-info-panel.html:14`, `main.css:1367` |
| Conditional / restricted | Solid orange background | `orange` | `.cost--conditional` | `gr-image-cost-message.html:3`, `gr-info-panel.html:40`, `main.css:1360` |
| Pay / no rights / over-quota | Solid red background | `red` | `.cost--pay`, `.cost--no_rights`, `.cost--overquota` | `gr-info-panel.html:20-33`, `preview/image.html:152`, `main.css:1354-1356` |
| Leased override (allow-use lease on a pay/overquota image) | Solid teal background | `teal` | `.cost--leased` | `preview/image.html:161`, `main.css:1364` |

Note: `cost--no_rights` and `cost--overquota` map to the same visual as `cost--pay` (all three use `background-color: red`). They are semantically distinct but visually identical.

### 2.3 Lease access type colours

Source: `kahuna/public/js/leases/leases.css`. The class names are generated dynamically by `leaseClass()` in `leases.js:259-263` which splits the access string into parts and prefixes each with `lease__`. E.g. `allow-use` → `lease__allow lease__use`.

| Semantic role | Visual treatment | Hex | CSS class(es) | Source (file:line) |
|---|---|---|---|---|
| Allow (generic — syndication) | Light green background | `#90ee90` (lightgreen) | `.lease__access.lease__allow` | `leases.css:66-68` |
| Allow use (specifically) | Teal background (overrides light green) | `teal` | `.lease__access.lease__allow.lease__use` | `leases.css:70-72` |
| Deny (any) | Red background | `red` | `.lease__access.lease__deny` | `leases.css:74-76` |
| Lease item container (any state) | Dark grey background | `#565656` | `.lease__item` | `leases.css:35-38` |
| Inactive lease | (No distinct colour class; `.lease__inactive` is set but not styled in CSS — the dark grey container persists) | `#565656` | `.lease__inactive` (unstyled) | `leases.js:262`, `leases.css` (no rule for inactive) |

**Inconsistency note:** `deny-syndication` and `deny-use` are both `.lease__deny` → both red. There is no visual distinction between the two deny types. `allow-syndication` gets light green (`.lease__allow` without `.lease__use`); `allow-use` gets teal.

### 2.4 Persistence / library state

No dedicated colour class. The archiver component uses icon-only affordance (library icons) with standard button styles. "Kept in Library" appears as a disabled grey button (inherits base button colour). No separate hex in the CSS for this state — `gr-archiver.css` does not define background colour rules.

### 2.5 Action affordances (global button classes)

| Semantic role | Visual treatment | Hex | CSS class | Source (file:line) |
|---|---|---|---|---|
| Save / primary action | Solid sky-blue background, white text | `#00adee`; hover `#008fc5` | `.button-save` | `main.css:493-506` |
| Cancel / neutral | Mid-grey background, white text | `#898989`; hover `#666666` | `.button-cancel`, `.button-edit` | `main.css:508-516` |
| Destructive confirm (Tier A/B) | Red background; red on confirm state | `red`; hover `#960000` | `.gr-confirm-delete--confirm` | `gr-confirm-delete.css:18-25` |
| Destructive confirm (Tier C) | Solid red background, ⚠ icon prefix | `red`; hover `#960000` | `.button--confirm-delete` | `main.css:531-541` |

---

## Section 3 — Inline edit affordance (✎ pencil button)

### 3.1 The `.image-info__edit` button

The ✎ button is a plain `<button class="image-info__edit">` rendered inside `.image-info__wrap`. There is no shared template partial — it is hand-written inline in `gr-image-metadata.html` at every field site (e.g. lines 127, 208, 411, 454, 570, 623). No shared AngularJS directive wraps it.

**CSS behaviour (`main.css:2276-2300`):**

| State | Behaviour | Hex |
|---|---|---|
| Default (not hovered over parent row) | `display: none` — ✎ is invisible | — |
| Parent `.image-info__wrap:hover` | `display: block` — ✎ appears | — |
| ✎ button hover | White text on `#222` background; `border-radius: 50%`; 1px white border | `#222` |
| Position | `position: absolute; top: 0; right: 0` — top-right corner of its `.image-info__wrap` container | — |

The button is a `21 × 21px` circle (line-height and width both `21px`, `border-radius: 50%`) — `main.css:2281-2293`.

### 3.2 xeditable interaction

After clicking ✎, the xeditable directive replaces the read-mode span with an input/textarea. The ✎ button is hidden while the form is active (`ng-hide="editForm.$visible"` — pattern appears at every field site e.g. `gr-image-metadata.html:127`). A Save (✓) / Cancel (✗) button pair appears inline below the field using `.button-save` / `.button-cancel`.

During save: the input gets `image-info__editor--saving` → `border: 1px dashed #ccc` — `main.css:2327`.
On error: `image-info__editor--error` → `border: 1px solid #BB1212` (dark red) — `main.css:2322`.

### 3.3 "Unknown (click ✎ to add)" empty-state

No shared template. The text is written inline in `gr-image-metadata.html` at every field site, conditionally on `!ctrl.metadata[field] && ctrl.userCanEdit`. The CSS class is `editable-empty`:

```
.image-info__wrap .editable-empty,
.image-info__wrap .editable-empty:hover {
    color: #aaa;   /* light grey */
}
```
`main.css:2317-2320`.

When `!ctrl.userCanEdit`, the fallback text is plain `"Unknown"` — no special class, just static text. This two-path pattern is repeated verbatim at Title (`gr-image-metadata.html:163-171`), Description (`:218-222`), Special instructions (`:295-303`), Taken on (`:374-377`), Credit (`:479-484`), Copyright (`:650-657`), and all domain metadata fields.

### 3.4 Inconsistency: upload / search editor context

In the search results editor (`kahuna/public/js/edits/image-editor.html`) and upload editor (`edits/image-editor.html`), a different pattern is used — `.edit-button` instead of `.image-info__edit`. The `.edit-button` is always `display: block` (not hover-reveal) and uses `position: relative` instead of `absolute`. `main.css:2294-2296`. The visual outcome is similar but `.edit-button` is always visible whereas `.image-info__edit` is hover-reveal only.
