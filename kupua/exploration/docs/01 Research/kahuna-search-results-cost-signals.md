# Kahuna Search-Results UI — Server-Computed-Field Signals

- **Audited by:** Claude Sonnet 4.6 — 7 May 2026
- **Purpose:** Cluster 1 scoping — exhaustive inventory of visible signals in
  Kahuna's search-results surface driven by `cost`, `valid`, `invalidReasons`,
  `leases`, `persisted`, `actions`, `isPotentiallyGraphic`, `syndicationStatus`,
  `usageRights.category/restrictions`
- **Confidence:** High overall. See per-section notes.

---

## Section 0 — Methodology

**Files read** (primary):

| File | Role |
|------|------|
| `kahuna/public/js/preview/image.html` | Grid-cell template |
| `kahuna/public/js/preview/image.js` | Grid-cell controller |
| `kahuna/public/js/search/results.html` | Results wrapper; toolbar; grid loop |
| `kahuna/public/js/search/results.js` | Results controller; filter handling |
| `kahuna/public/js/search/query.html` | Filter bar template |
| `kahuna/public/js/search/query.js` | Cost-filter logic, nonFree param |
| `kahuna/public/js/edits/image-editor.html` | Single-image info panel |
| `kahuna/public/js/edits/image-editor.js` | Info-panel controller |
| `kahuna/public/js/components/gr-info-panel/gr-info-panel.html` | Multi-image panel cost pills |
| `kahuna/public/js/components/gr-info-panel/gr-info-panel.js` | Multi-panel cost state + gradient logic |
| `kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html` | Leases section inside info panel |
| `kahuna/public/js/leases/leases.html` | Lease list rendering |
| `kahuna/public/js/leases/leases.js` | Lease class logic |
| `kahuna/public/js/leases/leases.css` | Lease colour rules |
| `kahuna/public/js/image/service.js` | `getStates()` — cost/validity/persisted computed properties |
| `kahuna/public/js/services/image-logic.js` | `isStaffPhotographer`, `getArchivedState`, `getPersistenceExplanation` |
| `kahuna/public/js/services/image-list.js` | `getCostState`, `getOccurrences` for multi-panel |
| `kahuna/public/js/services/graphic-image-blur.js` | `isPotentiallyGraphic` logic |
| `kahuna/public/js/services/image/usages.js` | Usages fetch (separate API call) |
| `kahuna/public/js/components/gr-syndication-icon/gr-syndication-icon.html` | Syndication icon |
| `kahuna/public/js/components/gr-syndication-icon/gr-syndication-icon.css` | Syndication colour rules |
| `kahuna/public/js/components/gr-archiver-status/gr-archiver-status.html` | Archiver status icon |
| `kahuna/public/js/components/gr-archiver-status/gr-archiver-status.css` | Archiver colour rules |
| `kahuna/public/js/components/gr-icon/gr-icon.css` | `icon-warning` + sent-to-photosales icon |
| `kahuna/public/stylesheets/main.css` | Global cost/validity/overlay/selection CSS |
| `media-api/app/lib/ImageResponse.scala` | Confirms which fields are on search-hit responses |
| `media-api/app/lib/elasticsearch/ElasticSearch.scala` | Confirms `isPotentiallyGraphic` is script-field, search-hit only |
| `common-lib/src/main/scala/com/gu/mediaservice/model/Image.scala` | Image model — which fields exist |

**Strategy:** Traced from template through controller through service through CSS.
Checked search-hit vs detail-only by reading `ImageResponse.scala` (which fields are
added to both) vs `ElasticSearch.scala` (script fields added only during search).

**Confidence notes:**

- *Cost icons, staff border, overlays, filter, multi-panel pills*: High — all directly
  read from template + CSS.
- *Syndication icon, archiver status*: High — read component files.
- *`isPotentiallyGraphic`*: High — confirmed as painless script field (search-hit only)
  in `ElasticSearch.scala:146,155`.
- *Usage icons (print, digital, syndication)*: High — confirmed as separate API call in
  `usages.js:61-67` (`image.usages.getData()`), NOT from search-hit data.
- *Ticker badges*: Medium — structure clear, exact server-defined `backgroundColour`
  values are not in source code (configured server-side per deployment).
- *Table view*: None found. Kahuna has no search-results table view. Section skipped.

---

## Section 1 — Grid Cell Anatomy

Each grid cell is `<li>` → `<div class="result">` → `<ui-preview-image>` →
`<div class="preview">`. Layers front-to-back:

```
┌─────────────────────────────────────────────────────┐
│ [checkbox] .result__select (top-left, hover/selected) │
│                                                       │
│ [SELECTED ONLY] .result__select__overlay              │
│   full-cell colour tint (alert=red/warning=orange/    │
│   lease_attached=teal), opacity 0.3                   │
│                                                       │
│ [SELECTED ONLY] .result__select__overlay__text        │
│   configurable text banner at top of cell             │
│                                                       │
│ .preview__link (or .preview__no-link in selectionMode)│
│   ├── .preview__fade (gradient fade for info overlay) │
│   └── <img class="preview__image">                   │
│         ├── .preview__image--staff (thick blue border)│
│         └── .preview__image--agency-pick (dead class) │
│         [.is-potentially-graphic on parent <a>/<span>]│
│           → blur(15px) + "POTENTIALLY GRAPHIC" text   │
│                                                       │
│ .preview__info (bottom info overlay)                  │
│   ├── .preview__collections (collection chips)        │
│   ├── .preview__labeller (labels)                     │
│   └── .preview__description (description text)        │
│                                                       │
│ .preview__bottom-bar                                  │
│   └── .preview__upload-time (date)                   │
│                                                       │
│ .preview__bottom-icons (float-right cluster)          │
│   ├── print-usages icon (if any)                      │
│   ├── digital-usages icon (if any)                    │
│   ├── cost/flag icon (flagState switch)               │
│   ├── syndication icon (if status ≠ 'unsuitable')     │
│   ├── archiver-status icon (kept/archived/unarchived) │
│   └── photo-sales icon (conditional)                  │
└─────────────────────────────────────────────────────┘
```

The outer `.result` border is `5px solid transparent` by default; turns
`#00adee` (cyan) when `.result--selected`. `.result--seen` sets `opacity: 0.5`
(client-side localStorage state, not server-computed).

---

## Section 2 — Element Inventory

> **No table view.** Kahuna has no search-results table view — confirmed by
> absence of any table-view template or toggling mechanism in the codebase.
> `Surface: table-row` is unused.

| # | Element | Surface | HTML element + class(es) | SCSS file:line | Field(s) consumed | Hit-or-detail | Conditional render rule | Visual treatment | Replicate vs improve note |
|---|---------|---------|--------------------------|---------------|-------------------|---------------|------------------------|-----------------|--------------------------|
| 1 | **Pay badge** | grid-cell | `<div ng-switch-when="pay" class="cost bottom-bar__action bottom-bar__action--cost preview__cost preview__bottom-icons-align-right" ng-class="{'cost--pay': !ctrl.hasActiveAllowLease, 'cost--leased': ctrl.hasActiveAllowLease}">` `<span>£</span>` — `preview/image.html:161–169` | `main.css:1354` (`.cost--pay { background-color: red }`), `main.css:1364` (`.cost--leased { background-color: teal }`) | `cost` ("pay") + `leases.leases[].active && access==='allow-use'` | **search-hit** | `ctrl.flagState === 'pay'` (flagState = `hasRestrictions ? 'conditional' : costState`; pay only shown when no usageRestrictions) | `£` text, white; red bg normally; teal bg when active allow-lease present; `font-size: 1.4rem; padding: 0 10px` | `replicate-1:1` |
| 2 | **Overquota badge** | grid-cell | `<div ng-switch-when="overquota" class="cost ..." ng-class="{'cost--overquota': !ctrl.hasActiveAllowLease, 'cost--leased': ctrl.hasActiveAllowLease}">` `<gr-icon>trending_up</gr-icon>` — `preview/image.html:150–159` | `main.css:1356` (`.cost--overquota { background-color: red }`), `main.css:1364` (`.cost--leased { background-color: teal }`) | `cost` ("overquota") + `leases.leases[].active && access==='allow-use'` | **search-hit** | `ctrl.flagState === 'overquota'` | `trending_up` Material icon; red bg normally, teal bg if leased; tooltip includes "Leased, but:" prefix when leased | `replicate-1:1` |
| 3 | **No-rights badge** | grid-cell | `<div ng-switch-when="no_rights" class="cost cost--no_rights bottom-bar__action bottom-bar__action--cost preview__cost preview__bottom-icons-align-right">` `<gr-icon>warning</gr-icon>` — `preview/image.html:143–149` | `main.css:1354–1356` (`.cost--no_rights { background-color: red }`) | `usageRights` (empty object → `costState = 'no_rights'`) | **search-hit** | `ctrl.flagState === 'no_rights'` i.e. `!hasRights` (`usageRights` is `{}`) | `warning` Material icon; always red bg; no lease teal override for this state | `replicate-1:1` |
| 4 | **Conditional/restrictions badge** | grid-cell | `<div ng-switch-when="conditional" class="cost bottom-bar__action bottom-bar__action--cost preview__cost preview__bottom-icons-align-right" ng-class="{'cost--conditional': !ctrl.hasActiveAllowLease, 'cost--leased': ctrl.hasActiveAllowLease}">` `<gr-icon>flag</gr-icon>` — `preview/image.html:173–183` | `main.css:1360` (`.cost--conditional { background-color: orange }`), `main.css:1364` (`.cost--leased { background-color: teal }`) | `usageRights.usageRestrictions` (presence overrides costState) OR `cost === 'conditional'` | **search-hit** | `ctrl.flagState === 'conditional'` i.e. `hasRestrictions \|\| cost==='conditional'` | `flag` Material icon; orange bg normally, teal if leased; tooltip "Restrictions: …" | `replicate-1:1` |
| 5 | **isPotentiallyGraphic blur + text overlay** | grid-cell | `<a class="preview__link" ng-class="{'is-potentially-graphic': ctrl.image.isPotentiallyGraphic}">` (and `<span class="preview__no-link" ...>` in selectionMode) — `preview/image.html:41, 52` | `main.css:1593` (`.is-potentially-graphic > img { filter: blur(15px) }`), `main.css:1597` (`::after content: "POTENTIALLY GRAPHIC IMAGE \A (hover to reveal)"; white; absolute; top: 20px`), `main.css:1608,1611` (hover removes blur + hides text) | `image.data.isPotentiallyGraphic` (server script field) AND client-side keyword heuristics in description/title/specialInstructions/keywords | **search-hit ONLY** — Painless script field computed at query time; NOT present on `GET /images/{id}` (confirmed `ElasticSearch.scala:146,155`). Absence on detail = "unknown", not "false". | `graphicImageBlurService.isPotentiallyGraphic(image)` = `shouldBlurGraphicImages cookie && (server flag \|\| text match)` | 15px blur on `<img>`; `::after` pseudo-element "POTENTIALLY GRAPHIC IMAGE\n(hover to reveal)" in bold white, centred, absolute positioned. Hover → `filter: none` + `opacity: 0` on text. Transition 0.6s. | `replicate-with-tweak` — server field drives it; client text matching is a reasonable fallback. Kupua should implement blur but the `isPotentiallyGraphic` field gap on detail (§0) is a known asymmetry — do not treat as a bug. |
| 6 | **Staff-photographer thick border** | grid-cell | `<img class="preview__image" ng-class="{'preview__image--staff': ctrl.states.isStaffPhotographer, 'preview__image--agency-pick': ctrl.states.isAgencyPick}">` — `preview/image.html:49` | `main.css:1658` (`.preview__image--staff { border: 10px solid #005689; box-sizing: border-box }`) | `usageRights.category` ∈ `['staff-photographer', 'contract-photographer', 'commissioned-photographer']` | **search-hit** | `imageLogic.isStaffPhotographer(image)` | 10px solid #005689 (Guardian blue) border around thumbnail; `box-sizing: border-box` so image shrinks rather than cell expanding | `replicate-1:1` — **Note:** `preview__image--agency-pick` is also set (driven by `agencyPicksIngredients` config) but has **no CSS rule whatsoever** — dead class. Do not replicate. |
| 7 | **Alert overlay tint** (selected + invalid image) | grid-cell | `<div class="result__select__overlay" ng-class="{'alert': ctrl.showAlertOverlay(), ...}" ng-if="ctrl.showOverlay()">` — `preview/image.html:3–8` | `main.css:3074` (`.result__select__overlay.alert { background-color: red; opacity: 0.3 }`) | `invalidReasons` (non-empty, excluding `conditional_paid` key); `leases`; client config `enableWarningFlags` | **search-hit** (`invalidReasons` added to response by `ImageResponse.scala:93`) | `isSelected && enableWarningFlags && Object.keys(invalidReasons).find(k => k !== 'conditional_paid') !== undefined` | Full-cell red translucent overlay (opacity 0.3) + red text banner at top of cell with configurable alert copy from `_clientConfig.imagePreviewFlagAlertCopy` | `replicate-1:1` — gate on config flag as Kahuna does |
| 8 | **Warning overlay tint** (selected + conditional, no active lease) | grid-cell | same `result__select__overlay` element, class `warning` — `preview/image.html:4` | `main.css:3079` (`.result__select__overlay.warning { background-color: orange; opacity: 0.3 }`) | `cost`/`usageRights.usageRestrictions` (flagState=conditional) + `leases` (no active allow-use) | **search-hit** | `isSelected && enableWarningFlags && flagState==='conditional' && hasActiveAllowLease === undefined` | Full-cell orange translucent overlay + orange banner, black text (`result__select__overlay__text.warning { color: black }`) with `_clientConfig.imagePreviewFlagWarningCopy` | `replicate-1:1` |
| 9 | **Lease-attached overlay tint** (selected + active allow-use lease) | grid-cell | same `result__select__overlay` element, class `lease_attached` — `preview/image.html:5` | `main.css:3084` (`.result__select__overlay.lease_attached { background-color: teal; opacity: 0.3 }`) | `leases.leases[].active && access==='allow-use'` | **search-hit** | `isSelected && enableWarningFlags && !showAlertOverlay && hasActiveAllowLease !== undefined` | Full-cell teal translucent overlay + teal banner, white text with `_clientConfig.imagePreviewFlagLeaseAttachedCopy` | `replicate-1:1` |
| 10 | **Overlay warning text banner** (accompanies rows 7–9) | grid-cell | `<div class="result__select__overlay__text" ng-class="{'alert': ctrl.showAlertOverlay(), 'warning': ctrl.showWarningOverlay(), 'lease_attached': ctrl.showActiveAllowLeaseOverlay()}" ng-if="ctrl.showOverlay()">` — `preview/image.html:63–73` | `main.css:3089` (position, bold, 1.3rem, padding 5px 10px); `main.css:3100` (alert: red bg, white text); `main.css:3103` (warning: orange bg, black text); `main.css:3107` (lease_attached: teal bg, white text) | same as 7–9; text from `_clientConfig.imagePreviewFlag*Copy` | **search-hit** | same conditions as 7–9; always shown with the overlay | Coloured text banner at top-left of cell; text is deployment-configurable | `replicate-1:1` — the configuration pattern (text from clientConfig) is worth preserving |
| 11 | **Syndication icon** | grid-cell | `<div ng-if="ctrl.states.syndicationStatus !== 'unsuitable'"><gr-syndication-icon image="ctrl.image"></gr-syndication-icon></div>` — `preview/image.html:187–189`; inner: `<gr-icon class="gr-icon--large syndication-status--{{ ctrl.states.syndicationStatus }}">monetization_on</gr-icon>` — `gr-syndication-icon.html:2` | `gr-syndication-icon.css:1–16` (`.syndication-status--sent { color: green }`, `--queued { color: orange }`, `--blocked { color: red }`, `--review { color: white }`) | `syndicationStatus` (derived server-side from syndicationRights + usages + leases in `Image.scala`) | **search-hit** (added by `addSyndicationStatus` in `ImageResponse.scala`) | `syndicationStatus !== 'unsuitable'` | `monetization_on` Material icon ($ in circle); coloured per status value; tooltip from `syndicationReason` | `replicate-1:1` — only show when rights have been acquired (not 'unsuitable') |
| 12 | **Archiver status icon** | grid-cell | `<gr-archiver-status class="bottom-bar__action preview__bottom-icons-align-right" image="ctrl.image" readonly="ctrl.selectionMode">` — `preview/image.html:191–194`; inner `gr-archiver-status.html:1–35` (ng-switch on `ctrl.archivedState`) | `gr-archiver-status.css:1–26` (`--archived: color #ccc`, `--unarchived: color #666`, `:hover: color white`) | `persisted.value` + `persisted.reasons` (to determine kept/archived/unarchived state) | **search-hit** (added by `addPersistedState` in `ImageResponse.scala`) | Always shown (not `ng-if` gated); `archivedState` = `'kept'` (persisted but not archivable), `'archived'` (archived), `'unarchived'` | Three states: **kept** → `gr-library-locked-icon`, grey #ccc, tooltip "Kept in Library because…"; **archived** → `gr-library-added-icon` (hover shows remove icon), grey #ccc; **unarchived** → `gr-library-add-icon` button, dark grey #666, interactive. In `selectionMode`, `readonly=true` hides the interactive button. | `replicate-1:1` |
| 13 | **Print usages icon** | grid-cell | `<span class="bottom-bar__meta-item preview__has-print-usages" ng-if="ctrl.hasPrintUsages">` `<gr-icon ng-class="{'icon-warning': ctrl.recentPrintUsages.count() > 0}">local_library</gr-icon>` — `preview/image.html:145–150` | `gr-icon.css:24` (`.icon-warning { color: #DD0000; font-size: 1.4em }`) | `usages[]` filtered to `platform==="print"`. Each `Usage` carries `platform`, `status`, `dateAdded`. | **search-hit** — `ImageResponse.usagesEntity` returns `EmbeddedEntity[List[UsageEntity]](uri, Some(usages.map(usageEntity)))` and each `usageEntity` is `EmbeddedEntity[Usage](uri, Some(usage))` (`media-api/app/lib/ImageResponse.scala:369,372`). Full list inline. Kahuna's `image.usages.getData()` is a sync Angular resource resolve, NOT a network call. **Corrected 7 May 2026** — prior "NOT on search hit" claim was wrong. | `ctrl.hasPrintUsages === true` | `local_library` Material icon; normally uncoloured (#666 inherited); with `icon-warning` → bright red #DD0000, 1.4em if used within last 7 days | `replicate-1:1` — free from search-hit data, no extra fetch. |
| 14 | **Digital usages icon** | grid-cell | `<span class="bottom-bar__meta-item preview__has-web-usages" ng-if="ctrl.hasDigitalUsages">` `<gr-icon ng-class="{'icon-warning': ctrl.recentDigitalUsages.count() > 0}">phonelink</gr-icon>` — `preview/image.html:152–158` | `gr-icon.css:24` (same `.icon-warning` rule) | `usages[]` filtered to `platform==="digital"`. | **search-hit** — same as row 13. **Corrected 7 May 2026.** | `ctrl.hasDigitalUsages === true` | `phonelink` Material icon; normally uncoloured; `icon-warning` → red if used in last 7 days | `replicate-1:1` — free from search-hit data, no extra fetch. |
| 15 | **Photo Sales sent icon** | grid-cell | `<span class="bottom-bar__meta-item preview__has-syndication-usages preview__bottom-icons-align-right" ng-if="(ctrl.hasSyndicationUsages \|\| ctrl.uploadedByCapture) && ctrl.showSendToPhotoSales() && ctrl.showPaid">` `<gr-sent-to-photosales-icon>` — `preview/image.html:197–202` | `gr-icon.css:54` (`.gr-sent-to-photosales-icon svg { width: 42px; height: 32px; padding-right: 6px }`) | `usages[]` filtered to `platform==="syndication"` OR `uploadedBy === 'Capture_AutoIngest'`. Both on search hit. | **search-hit** — both halves available. Render path gated by config (see Conditional render rule). **Corrected 7 May 2026.** | `(hasSyndicationUsages \|\| uploadedByCapture) && showSendToPhotoSales() && showPaid` (config + permission gates) | Custom SVG icon (42×32px); no colour variation | `worth-questioning` — Guardian PROD + TEST have `showSendToPhotoSales=false`, so render path doesn't fire even though data is free. |
| 16 | **Cost text pill** | single-info-panel | `<div class="result-editor__info-item result-editor__info-item--first" ng-switch="ctrl.image.data.usageRights.usageRestrictions ? 'conditional' : ctrl.image.data.cost">` + `<span class="result-editor__status status status--invalid" ng-switch-when="pay">Pay to use</span>` etc. — `image-editor.html:55–70` | `main.css:921` (`.status--valid { background-color: green }`), `main.css:925` (`.status--invalid { background-color: red }`), `main.css:1948` (`.result-editor__status { display: block; text-align: center; padding: 2px 5px }`) | `cost` + `usageRights.usageRestrictions` | **search-hit** | `ng-switch` on `usageRestrictions ? 'conditional' : cost` | **pay** → "Pay to use", red pill; **overquota** → "Quota exceeded for this supplier", red pill; **free** → "Free to use", green pill; **conditional** → "Restricted use", no background colour class (neutral/dark) | `replicate-1:1` — clear, minimal, informative |
| 17 | **Validity link (View image / Unusable)** | single-info-panel | `<a class="result-editor__status status status--valid" ng-switch-when="ready">View image ▸</a>` and `<a class="result-editor__status status status--invalid" ng-switch-when="invalid">Unusable <gr-icon>help</gr-icon></a>` — `image-editor.html:73–84` | `main.css:921` (green), `main.css:925` (red) | `valid` (boolean) | **search-hit** (added by `addValidity` in `ImageResponse.scala`) | `ctrl.status = image.data.valid ? 'ready' : 'invalid'` | **ready** → "View image ▸" green link; **invalid** → "Unusable" red link with `help` icon, tooltip "This image cannot be used in content, a lease is required." | `replicate-1:1` |
| 18 | **Leases list** | single-info-panel | `<div ng-if="ctrl.displayLeases()" class="image-info__group">` → `<gr-leases>` → `<li ng-repeat="lease in ctrl.leases.leases" class="lease__item">` `<div class="lease__wrapper" ng-class="ctrl.leaseClass(lease)">` — `gr-image-metadata.html:113–127`; `leases.html:130–166` | `leases.css:66` (`.lease__access.lease__allow { background-color: #90ee90 }`), `leases.css:70` (`.lease__access.lease__allow.lease__use { background-color: teal }`), `leases.css:74` (`.lease__access.lease__deny { background-color: red }`) | `leases.leases[]` — access, startDate, endDate, notes, active | **search-hit** (`leases` is part of `Image` model, serialised by `imageResponseWrites`) | `ctrl.displayLeases()` (always true when images present) AND `ctrl.totalImages === 1` for individual list; multi-image shows "N current + M inactive" count line instead | Each lease as a card: `leaseClass(lease)` adds `lease__allow/deny`, `lease__use/syndication`, `lease__active/inactive`; allow-use=teal, allow-syndication=light green, deny=red. Date text: start "Starts X ago/Starts in X", end "Expires in X / Expired X / Never expires". | `replicate-1:1` |
| 19 | **Cost summary pills** | multi-info-panel | `<div ng-switch-when="free" class="image-notice image-info__group status cost cost--free">{{cost.count}} free</div>` (and pay/overquota/conditional variants) + `ng-style="ctrl.stylePercentageLeased(cost, 'red')"` — `gr-info-panel.html:8–48` | `main.css:1354–1368` (same `.cost--*` colour classes); gradient via inline `background-image: linear-gradient(90deg, teal 0 N%, red N% 100%)` | `cost` + `usageRights.usageRestrictions` (to classify) + `leases.leases[].active && access==='allow-use'` (for leased-fraction gradient) | **search-hit** | Always shown when `selectedImages.size > 0`; one pill per distinct cost type in the selection | Count labels: "N free" (green pill), "N paid" (red), "N over quota" (red), "N restricted" (orange), "N no rights" (red). Leased-fraction gradient overlaid: teal left / red or orange right, proportional to how many of that type also have an active allow-lease. | `replicate-1:1` — gradient encodes editorial-meaningful information (active `allow-use` leases lift the paid blocker, rescuing paid → usable). Decided 7 May 2026 to replicate exact colours (`teal` / `red` / `orange` literals) since kahuna semantic colours are muscle-memory. `getCostState` in `image-list.js:33` applies same `hasRestrictions → 'conditional'` override as grid cell. |
| 20 | **Cost filter checkbox** | filter-bar | `<input type="checkbox" ng-model="searchQuery.filter.nonFree" ng-true-value="{{searchQuery.costFilterTrueValue}}" ng-false-value="{{searchQuery.costFilterFalseValue}}" />` `{{ searchQuery.costFilterLabel }}` — `search/query.html:44–50` | `main.css:1017` (`.search__modifier-checkbox label` — standard inline label layout) | server-side `free` search param: when nonFree ≠ `'true'`, adds `free: true` to ES query; not a field on results | **N/A** (filter param, not a result field) | `!usePermissionsFilter && !useAISearch` (hidden in permissions-filter mode) | Standard checkbox + label. Label text from `_clientConfig.costFilterLabel` (e.g. "Include non-free images"). When active (nonFree=`'true'`), paid images appear in results; when inactive (default), they disappear server-side — **no visual indicator on remaining cells**. | `replicate-with-tweak` — Kupua's `nonFree` param handling should mirror this exactly. The label is configurable. No cell-level indicator is by design, not an oversight. |
| 21 | **Ticker badges** | toolbar | `<button class="image-results-ticker" ng-style="{'background-color': tickerCount.backgroundColour}" ng-click="ctrl.applyFilter(tickerCount.searchClause)">{{tickerCount.value}} {{name}}</button>` — `results.html:34–52` | `main.css:1519` (`.image-results-ticker { font-family: inherit; color: white; display: inline-block; padding: 2px 4px; border-radius: 2px; margin-left: 5px }`) | `actions.tickerCounts` from search response (name, value, backgroundColour, searchClause, subCounts — all server-defined) | **search-hit** (from search response `actions` map) | `tickerCount.value !== totalResults && tickerCount.value > 0` | Small inline pill button; server-specified background colour; white text; count + name label; clicking applies `searchClause` to query; tooltip shows last-checked time; can have sub-count breakdown table | `replicate-with-tweak` — server-driven, no colour hardcoding in CSS. Kupua should support these when Grid API is available and gracefully absent otherwise (per graceful-absence directive). |

> **Row count: 21.** Within the 15–30 target. No padding was needed — scope held cleanly.

---

## Section 3 — "Free to use" Filter Behaviour

### Mechanism

The filter is a **query-parameter mutation** — no client-side filtering occurs.
When the checkbox is inactive (default), `results.js:524` sends `free: true` to
`mediaApi.search()`, which translates to an ES filter excluding non-free images.
When active (nonFree = `'true'`), `free: undefined` is sent and all images appear.

```javascript
// results.js:524
free: $stateParams.nonFree === 'true' ? undefined : true,
```

### Non-free cells

**Non-free images disappear from results entirely** — they are excluded server-side.
There is no dim, banner, or indicator on excluded cells (they are simply absent).
There is no visual indication on the remaining free cells that the filter is active.

### Filter control

- **Location:** collapsible "Search filters" panel below the search bar, toggled by
  a `filter_list` icon button — `search/query.html:36–43`
- **HTML:** `<input type="checkbox" ng-model="searchQuery.filter.nonFree"
  ng-true-value="{{costFilterTrueValue}}" ng-false-value="{{costFilterFalseValue}}">`
  — `search/query.html:44–49`
- **Label:** configurable via `_clientConfig.costFilterLabel` — no hardcoded text
  (`search/query.js:53`)
- **Mode:** configurable via `_clientConfig.costFilterChargeable`:
  - `costFilterChargeable = true` → checkbox ON = show paid (nonFree=`'true'`);
    default OFF = free-only
  - `costFilterChargeable = false` → reversed (checkbox OFF = show non-free)
  - The label, not the logic, communicates the direction to users

### Related cost-state filters

No explicit `is:paid`, `is:overquota`, or `is:conditional` filter chips are surfaced
in the Kahuna search UI. Users can type `cost:pay` etc. directly in the structured
query field. The ticker badges (row 21) can add filter clauses for server-defined
cost categories but are deployment-configured, not hardcoded.

### Permissions-filter mode

When `_clientConfig.usePermissionsFilter` is `true`, the standard filter panel
(including the cost checkbox) is **hidden** and replaced by a different component
(`gr-permissions-filter`). The cost filter is not relevant in that mode.

---

## Section 4 — Multi-Info Panel Cost / Lease / Validity Sections

The multi-image info panel is `gr-info-panel.html`. The cost pills (row 19 above)
are the primary server-computed-field signal.

**What's NOT covered by `selections-kahuna-pills-location-leases-findings.md`:**

The existing doc (`§8` and `§11`) covers leases pills in the multi-panel *per-image*
detail context. The info panel (as reached from the search-results multi-select view)
shows:

### Cost summary pills (see row 19 in detail)

`gr-info-panel.html:8–48` — driven by `getCostState(images)` → `getOccurrences()`:
one pill per distinct cost value across the selection. Colours match the single-cell
cost icon palette. The leased-fraction gradient (`stylePercentageLeased`) is specific
to this surface.

### Leases in multi-select

When `ctrl.totalImages > 1`, `leases.html:122–124` shows:
```
"N current leases + M inactive leases"
```
as a single line in italic grey (#CCC, `leases.css`) — an aggregate count, not
individual lease cards. This is the multi-select leases surface in the info panel.

Individual lease cards (row 18) only appear when exactly one image is selected
(`ctrl.totalImages === 1`).

**Overlap with existing docs:**

- Lease pills in multi-select selection-results panel → see
  `selections-kahuna-pills-location-leases-findings.md §8`
- Rights & Restrictions pill → see same doc `§11`
- No additional cost/lease/validity content in the multi-info panel beyond what
  rows 18–19 and the aggregate lease count above describe

---

## Section 5 — Cross-Cutting Observations (≤30 items, one line each)

1. `preview__image--agency-pick` class is set on the thumbnail when `isAgencyPick` is true but has **no CSS rule** in any stylesheet — dead class, do not replicate.
2. The overlay system (rows 7–9) is **only active when `_clientConfig.enableWarningFlags` is `true`** — entirely suppressed in deployments without it.
3. `result--seen` (opacity 0.5) is driven by localStorage (`ui-localstore`), not any server field — pure client state.
4. The `result--selected` cyan border (#00adee) is driven by client selection state, not a server field.
5. `usages` data (print/digital icons, rows 13–14) is fetched **per grid cell** on render — this is an O(N) API call pattern for a page of N cells.
6. The `uploadedByCapture` check (`uploadedBy === 'Capture_AutoIngest'`) in row 15 is the only metadata field (not usages) that drives the Photo Sales icon path.
7. `cost === 'free'` never produces a visible badge on the grid cell — there is no green "free" badge in the grid cell itself (green only appears in the info panel and multi-panel).
8. The `flagState` override (`hasRestrictions ? 'conditional' : costState`) means a `pay` image with `usageRestrictions` shows the `flag` icon, not `£` — this is intentional.
9. The `conditional_paid` key in `invalidReasons` is explicitly excluded from the alert overlay check (`image.js:148`) — it does not trigger the red overlay.
10. Ticker badges (row 21) support a sub-count breakdown table in their tooltip — the structure is generic but content is entirely server-defined per deployment.
11. The "Send to Photo Sales" batch action in the toolbar is gated by both `showSendToPhotoSales()` config and `showPaid` permission (user session) — two independent gates.
12. The `hasSyndicationRights` and `hasRightsAcquiredForSyndication` states are computed in `imageService` but are not directly used to drive any visible grid-cell element — they feed into `syndicationStatus` computation.
13. `archivedState = 'kept'` (lock icon) is shown when image is persisted for a reason OTHER than (or in addition to) being archived — e.g., cropped, used, leased. Tooltip shows human-readable reason list.
14. The free-image filter is stored in `localStorage` (`isNonFree` key) and persisted across page loads — the checkbox auto-checks to the last-used value.
15. `usePermissionsFilter` mode shows a completely different filter UI; all the filters described in Section 3 are hidden in that mode.
16. `image.data.valid` is a boolean on every response (search hit and detail) — not to be confused with `isValid` in `imageService.getStates()` which is the same value aliased.
17. There is no `invalidReasons` display in the grid cell itself (only in the overlay text banner and on the standalone detail page) — the grid cell only exposes whether there are reasons, not what they are, via the overlay colour.
18. The standalone image-detail page (`/images/{id}`) has its own inventory — see `kahuna-image-detail-inventory.md` — the info panel as described here is the RIGHT-HAND panel in search results view, not the detail page.
19. Collections chips in `.preview__info` use a server-supplied `cssColour` field per collection for background colour — server-computed field not in the main scope but worth noting for Kupua's grid cell.

---

## Self-Check (3 random rows re-verified)

**Row 5** (`isPotentiallyGraphic`): Opened `preview/image.html:41` — confirmed
`ng-class="{'is-potentially-graphic': ctrl.image.isPotentiallyGraphic}"` on `<a>`.
Opened `main.css:1593` — confirmed `.is-potentially-graphic > img { filter: blur(15px); transition: filter 0.6s }`.
Opened `ElasticSearch.scala:146,155` — confirmed script field, search-hit only. ✓

**Row 12** (Archiver status): Opened `gr-archiver-status.html:8` —
`<span ng-if="!ctrl.isDeleted" ng-switch-when="kept" title="Kept in Library because…">`.
Opened `gr-archiver-status.css:1` — `{ color: #ccc }`. ✓

**Row 19** (Cost summary pills): Opened `gr-info-panel.html:14` —
`<div ng-switch-when="free" class="image-notice image-info__group status cost cost--free">{{cost.count}} free</div>`.
Opened `main.css:1367` (approx) — `.cost--free { background-color: green }`. ✓
