# Kahuna Image Detail UI Inventory

> Generated: 3 May 2026. Research-only. No code changes.
> Source: `kahuna/public/js/image/`, `kahuna/public/js/components/`, `kahuna/public/js/leases/`

---

## Section 0 — Methodology

### Files read

| File | Purpose |
|---|---|
| `kahuna/public/js/image/view.html` | Top-level template for image detail route |
| `kahuna/public/js/image/controller.js` | `ImageCtrl` — root controller for the view |
| `kahuna/public/js/image/service.js` | `imageService` factory — state computation |
| `kahuna/public/js/services/image-logic.js` | `canBeDeleted`, `canBeArchived`, archive state |
| `kahuna/public/js/services/image-accessor.js` | `isPersisted`, `readLeases`, `readLabels`, etc. |
| `kahuna/public/js/services/api/media-api.js` | `canUserArchive` |
| `kahuna/public/js/services/api/media-cropper.js` | `canDeleteCrops`, `canBeCropped` |
| `kahuna/public/js/services/api/leases.js` | `canUserEdit` (for leases panel) |
| `kahuna/public/js/services/image/usages.js` | `canDeleteUsages` |
| `kahuna/public/js/edits/service.js` | `canUserEdit` (authoritative for metadata editing) |
| `kahuna/public/js/util/get-deleted-state.js` | `isDeleted`, `canUndelete` |
| `kahuna/public/js/components/gr-archiver/gr-archiver.{html,js}` | Archive/Unarchive/Kept-in-Library button |
| `kahuna/public/js/components/gr-crop-image/gr-crop-image.{html,js}` | Crop button |
| `kahuna/public/js/components/gr-delete-image/gr-delete-image.js` | Delete button |
| `kahuna/public/js/components/gr-undelete-image/gr-un-delete-image.js` | Undelete button |
| `kahuna/public/js/components/gr-delete-crops/gr-delete-crops.js` | Delete All Crops button |
| `kahuna/public/js/components/gr-delete-usages/gr-delete-usages.js` | Delete All Usages button |
| `kahuna/public/js/components/gr-downloader/gr-downloader.{html,js}` | Download button/link |
| `kahuna/public/js/components/gr-more-like-this/gr-more-like-this.{html,js}` | AI search shortcut |
| `kahuna/public/js/components/gr-metadata-validity/gr-metadata-validity.{html,js}` | Validity/deletion notice banner |
| `kahuna/public/js/components/gr-image-cost-message/gr-image-cost-message.{html,js}` | Restricted-use cost banner |
| `kahuna/public/js/components/gr-image-metadata/gr-image-metadata.{html,js}` | Entire Metadata tab panel |
| `kahuna/public/js/components/gr-image-usage/gr-image-usage.{html,js}` | Usages tab panel |
| `kahuna/public/js/components/gr-collection-overlay/gr-collection-overlay.html` | Add-to-collection overlay |
| `kahuna/public/js/components/gr-export-original-image/gr-export-original-image.{html,js}` | Crop full frame shortcut |
| `kahuna/public/js/components/gr-display-crops/gr-display-crops.html` | Collapsible crop list in metadata panel |
| `kahuna/public/js/components/gr-syndication-rights/gr-syndication-rights.{html,js}` | Syndication rights from RCS |
| `kahuna/public/js/components/gr-photoshoot/gr-photoshoot.{html,js}` | Photoshoot field |
| `kahuna/public/js/leases/leases.{html,js}` | Lease list + add-lease form |

### Mapping approach

Kahuna uses AngularJS (1.x). Templates are `.html` files and controllers are `.js` files
co-located by feature under `kahuna/public/js/`. UI elements in `view.html` are composed
from directive components (`<gr-*>`) each with their own sub-templates and controllers.
I traced each directive in `view.html` to its component folder, then read the HTML template
for render rules and the JS controller for permission checks.

Permissions are checked in three patterns:
1. **HATEOAS link/action presence**: e.g. `image.getLink('edits')` → edit allowed. Source of truth is the server response.
2. **Session permissions**: `session.user.permissions.*` fetched via `mediaApi.getSession()`.
3. **Field value gates**: e.g. `image.data.valid`, `image.data.softDeletedMetadata`, `image.data.cost`.

### Confidence notes

- All 30+ rows have direct file:line citations.
- Crop image button condition is straightforward: `image.data.valid && softDeletedMetadata === undefined` (`gr-crop-image.js:22-23`). This implicitly ties to `EditMetadata`-derived validity, but is not a named permission check.
- `canDownloadCrop` and `restrictDownload` are read from `window._clientConfig` (server-injected config), not from session permissions. Treated as deployment config, not user permissions.
- Metadata templates, image types, domain metadata, and `showSendToPhotoSales` are config-driven (`window._clientConfig`); they may not appear at all in some deployments.

---

## Section 1 — Layout overview

```
┌────────────────────────────────────────────────────────────────────────┐
│ HEADER / TOP BAR                                                       │
│ [← Back to search]   [Share] [More like this] [Delete] [Download]     │
│                       [Archive/Library]  [Crop image ▾]               │
└───────────────┬────────────────────────┬───────────────────────────────┘
                │                        │
┌───────────────┴──────┐  ┌─────────────┴────────────────────────────────┐
│ LEFT: CROP PANEL      │  │ CENTRE: IMAGE AREA (main)                    │
│ Original thumbnail    │  │   [Replaced-by warning banner]               │
│  + dimensions         │  │   <easel> — original or selected crop        │
│ Full frame crop       │  │            full-screen on [F]                │
│ Crops list            │  └─────────────────────────────────────────────┘
│ [Delete ALL crops]    │
└───────────────────────┘
┌──────────────────────────────────────────────────────────────────────┐
│ RIGHT: INFO PANEL (overlapping right side of layout in practice)      │
│  [Validity/deletion notice banner]                                    │
│  [Restricted-use cost banner]                                         │
│  [Metadata] [Usages (N)]  ← tab switcher                             │
│                                                                       │
│  METADATA TAB:                                                        │
│    Metadata template selector (config)                                │
│    Rights & restrictions (usage rights)                               │
│    Image type (config)                                                │
│    Leases (conditional)                                               │
│    Title / Description / Special instructions                         │
│    Taken on / By (byline) / Credit                                    │
│    Location / Copyright                                               │
│    Uploaded / Uploader / Filename                                     │
│    Subjects / People / Domain metadata / Additional metadata          │
│    Collections  /  Labels  /  Photoshoot                             │
│    Syndication Rights (from RCS)                                      │
│    Keywords                                                           │
│    ▸ Show crops  (collapsible crop list)                              │
│                                                                       │
│  USAGES TAB:                                                          │
│    Photo sales panel (config)                                         │
│    Usage groups by status                                             │
│    [Delete All Usages]                                                │
└──────────────────────────────────────────────────────────────────────┘
```

Regions referenced in the inventory table: **Header**, **CropPanel**, **ImageArea**, **InfoPanel**.

---

## Section 2 — Element inventory

> **RW tags:** RO-pure = informational only | RO-degraded = read part meaningful, write counterpart missing breaks it | Write-only = pure action | Joined = read display IS the edit input

| # | Element | Region | RW-tag | Permission | Conditional render | Data field(s) | Action triggered | Source (file:line) | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Back to search link | Header | RO-pure | None | Always shown | — | `ui-sref="search"` | `image/view.html:4` | Returns to search results state |
| 2 | Share URL button | Header | Write-only | None | Always shown | `image.data.id` | Copies `rootUri + "/images/" + id` to clipboard; triggers global clipboard notification | `image/view.html:12`, `image/controller.js:218` | Uses `navigator.clipboard.writeText` |
| 3 | More like this | Header | RO-pure | Feature flag `enable-ai-search` | Only when `getFeatureSwitchActive('enable-ai-search')` | `image.data.id` | `ui-sref` to search with `similar:${id}` query | `gr-more-like-this.js:17`, `gr-more-like-this.html:3` | Queries AI search endpoint |
| 4 | Delete image button | Header | Write-only | `image.getAction('delete')` must resolve (HATEOAS) | `ctrl.canBeDeleted && !ctrl.isDeleted` | `image.data.id` | `mediaApi.delete(image)` then polls for soft-deletion | `image/view.html:21-24`, `image/controller.js:206-208`, `image-logic.js:18-20` | Wraps `gr-confirm-delete` — needs two clicks. Hidden if image already soft-deleted |
| 5 | Download button (single image) | Header | Write-only | HATEOAS link `download` on image (when `restrictDownload=true`); always otherwise | Hidden if image soft-deleted (`softDeletedMetadata !== undefined`) | `image.links[rel='download']` | Browser download via `<a href downloadUri>` | `gr-downloader.html:31-36`, `gr-downloader.js:34-48` | Shows "Cannot download" state when `restrictDownload=true` and `download` link absent |
| 6 | Download selected crop button | Header | Write-only | `canDownloadCrop` client config; plus single image selected | Only when a crop is selected and `_clientConfig.canDownloadCrop` | `crop.downloadLink` (asset S3 URL) | Browser download | `gr-downloader.html:37-49` | Drop-menu ▾ beside main download button |
| 7 | Add to Library button | Header | Write-only | `mediaApi.canUserArchive()` → HATEOAS link `archive` on root | `archivedState === 'unarchived' && canArchive && !isDeleted` | `image.data.persisted.value`, `image.data.persisted.reasons` | `archiveService.batchArchive(images)` | `gr-archiver.html:30-37`, `gr-archiver.js:55-57`, `media-api.js:134` | Requires `ArchiveImages` permission (HATEOAS-inferred) |
| 8 | Remove from Library button | Header | Write-only | `mediaApi.canUserArchive()` | `archivedState === 'archived' && !isDeleted` | Same as above | `archiveService.batchUnarchive(images)` | `gr-archiver.html:22-28` | — |
| 9 | Kept in Library indicator | Header | RO-pure | None | `archivedState === 'kept' && !isDeleted` | `image.data.persisted.reasons` | — (no action; tooltip shows reason) | `gr-archiver.html:3-10` | Shown when `persisted.reasons` include something other than 'archived' (e.g. usage, collection) |
| 10 | Image Deleted indicator | Header | RO-pure | None | `isDeleted && !canUndelete` | `image.data.softDeletedMetadata` | — | `gr-archiver.html:12-19` | Shows when user can't undelete (no permission, not uploader, not reaped) |
| 11 | Undelete button | Header | Write-only | `session.user.permissions.canDelete` OR `uploadedBy === session.user.email` OR `softDeletedMetadata.deletedBy === 'reaper'` | `isDeleted && canUndelete` | `image.data.softDeletedMetadata` | `mediaApi.undelete(image.data.id)` | `gr-archiver.html:38-44`, `util/get-deleted-state.js:13-24` | `canUndelete` resolved by `getDeletedState` factory |
| 12 | Crop image button | Header | Write-only | `image.data.valid === true && softDeletedMetadata === undefined` | `ctrl.canBeCropped` | `image.data.valid`, `image.data.softDeletedMetadata`, `image.data.usageRights` | `ui-sref` to crop route | `gr-crop-image.html:1-8`, `gr-crop-image.js:22-23` | Shows "Cannot crop" text when condition fails. Reacts to leases-updated and usageRights changes |
| 13 | Crop full frame shortcut (▾ menu) | Header | Write-only | Same as #12; only shown when `!hasFullCrop` | Dropdown from Crop button when `!ctrl.hasFullCrop` | `image.data.exports` | `mediaCropper.createFullCrop(image)` | `gr-crop-image.html:9-12`, `gr-export-original-image.js:22-38` | Hides when full-frame crop already exists |
| 14 | Keyboard shortcut C (crop) | Global | Write-only | (same as #12 in effect) | Always bound | `image.data.id` | `$state.go('crop', {imageId})` | `image/controller.js:116-121` | Out-of-scope per handoff; noted here for completeness |
| 15 | Keyboard shortcut F (fullscreen) | Global | Write-only | None | Always bound | — | Fullscreen API on `.easel__image` element | `image/controller.js:123-147` | Out-of-scope per handoff |
| 16 | Replaced-by warning banner | ImageArea | RO-pure | None | `usages.data` contains entry with `status === 'replaced'` | `image.data.usages.data[].status`, `image.data.usages.data[].childUsageMetadata.childMediaId` | Link to replacement image | `image/view.html:171-176`, `image/controller.js:162-164` | Shows as banner above easel; links to replacement media IDs |
| 17 | Original image (easel) | ImageArea | RO-pure | None | `!ctrl.crop` (no crop selected) | `ctrl.optimisedImageUri` (derived from `image.data.id` via imgops), `image.data.optimisedPng` | Fullscreen toggle [F] | `image/view.html:178-192` | PNG images get checkered background CSS class |
| 18 | Crop preview (easel) | ImageArea | RO-pure | None | `ctrl.crop` set | `crop.assets` (largest via `getExtremeAssets`) | Click navigates to `cropKey` | `image/view.html:195-209` | Loaded async after mediaCropper call |
| 19 | Drag-and-drop data (original) | ImageArea | RO-pure | None | On original image (`!ctrl.crop`) | `image.data.thumbnail`, `image.data.id` | Browser drag event | `image/view.html:47-53`, `image/view.html:178` | `asset-handle` element carries `data-source`, `data-embeddable-url` for external consumers |
| 20 | Drag-and-drop data (crop) | ImageArea | RO-pure | None | On crop view | Crop assets + `image.data.id + crop.id` | Browser drag event | `image/view.html:195` | — |
| 21 | Validity / deletion notice banner | InfoPanel | RO-pure | None | `showInvalidReasons` (see §4) or `showDenySyndication` | `image.data.invalidReasons`, `image.data.valid`, `image.data.softDeletedMetadata`, `image.data.leases.data.leases`, `image.data.usageRights`, `image.data.cost` | — | `gr-metadata-validity.html:1-43`, `gr-metadata-validity.js:17-34` | Three visual states: invalid (red), warning (amber), leased-override (green). Reacts to `leases-updated` and `images-updated` |
| 22 | Restricted-use cost banner | InfoPanel | RO-pure | None | `messageState === 'conditional'` (has usageRestrictions) | `image.data.usageRights.usageRestrictions` | — | `gr-image-cost-message.html:2-6`, `gr-image-cost-message.js:22` | Reads restrictions text from `usageRights`; shows inline |
| 23 | Metadata / Usages tab switcher | InfoPanel | RO-pure | None | Always shown | — | Switches `ctrl.selectedTab` | `image/view.html:162`, `image/controller.js:153-156` | Usages tab is disabled when `usagesCount === 0` |
| 24 | Metadata templates selector | InfoPanel / MetadataTab | Joined | `canUserEdit` (EditMetadata) + `_clientConfig.metadataTemplates` configured | `displayMetadataTemplates && userCanEdit && singleImage` | `_clientConfig.metadataTemplates` | Applies template to metadata, usageRights, collections, leases | `gr-image-metadata.html:3-16`, `gr-image-metadata.js:59` | Only visible for single image view when templates are configured |
| 25 | Rights & restrictions display | InfoPanel / MetadataTab | Joined | `canUserEdit` (EditMetadata) for write part | Always shown | `image.data.usageRights`, `image.data.usageRights.category`, `image.data.usageRights.usageRestrictions` | Edit button → `gr-usage-rights-editor` overlay | `gr-image-metadata.html:18-44` | Category shows as text when no summary; `usage-rights-summary` shown for multi-image |
| 26 | Usage rights edit button (✎) | InfoPanel / MetadataTab | Write-only | `canUserEdit` (EditMetadata) | `userCanEdit && !showUsageRights` | — | Opens `gr-usage-rights-editor` inline | `gr-image-metadata.html:38-42` | — |
| 27 | Image type selector | InfoPanel / MetadataTab | Joined | `canUserEdit` for write part | `_clientConfig.imageTypes.length > 0` | `image.data.metadata.imageType` | `editsService.updateMetadataField('imageType', ...)` | `gr-image-metadata.html:47-97`, `gr-image-metadata.js:66` | Dropdown `editable-select`; absent if imageTypes not configured |
| 28 | Leases panel | InfoPanel / MetadataTab | Joined | `canUserEdit` (EditMetadata) for write; reads shown to all | `userCanEdit` OR `leases.leases.length > 0` | `image.data.leases.data.leases[]` (access, startDate, endDate, notes, active) | Add/delete leases via `leaseService` | `gr-image-metadata.html:103-115`, `gr-image-metadata.js:518`, `leases/leases.html:1-160` | Four access types: allow-use, deny-use, allow-syndication, deny-syndication. Each lease shows: access type, dates, notes, delete button (if canEdit). Inactive leases shown dimmed |
| 29 | Title field | InfoPanel / MetadataTab | Joined | `canUserEdit` for write | Always shown | `image.data.metadata.title` | `editsService.updateMetadataField('title', ...)` | `gr-image-metadata.html:119-174` | Search link on value. "Unknown (click ✎ to add)" when empty + editable; "Unknown" when empty + read-only |
| 30 | Description field | InfoPanel / MetadataTab | Joined | `canUserEdit` for write | Always shown | `image.data.metadata.description` | `editsService.updateDescriptionField(...)` | `gr-image-metadata.html:177-257` | Textarea (not single-line). Description length warning component included |
| 31 | Special instructions field | InfoPanel / MetadataTab | Joined | `canUserEdit` for write | Always shown | `image.data.metadata.specialInstructions`, `image.data.metadata.usageInstructions` | `editsService.updateSpecialInstructionsField()` | `gr-image-metadata.html:262-336` | `usageInstructions` is a read-only overlay field from upstream; `specialInstructions` is user-editable on top |
| 32 | Taken on (dateTaken) | InfoPanel / MetadataTab | Joined | `canUserEdit` for write | Always shown | `image.data.metadata.dateTaken` | `editsService.updateMetadataField('dateTaken', ...)` | `gr-image-metadata.html:340-388` | `editable-datetime-local` widget |
| 33 | Byline field | InfoPanel / MetadataTab | Joined | `canUserEdit` for write | Shown only when `rawMetadata.byline` has value OR `userCanEdit` | `image.data.metadata.byline` | `editsService.updateMetadataField('byline', ...)` | `gr-image-metadata.html:389-441` | Search link on value |
| 34 | Credit field | InfoPanel / MetadataTab | Joined | `canUserEdit` for write | Always shown | `image.data.metadata.credit` | `editsService.updateMetadataField('credit', ...)` | `gr-image-metadata.html:443-501` | Has typeahead autocomplete from `ctrl.credits($viewValue)` |
| 35 | Location field | InfoPanel / MetadataTab | Joined | `canUserEdit` for write | Shown when any of subLocation/city/state/country populated, OR `userCanEdit` | `image.data.metadata.subLocation`, `image.data.metadata.city`, `image.data.metadata.state`, `image.data.metadata.country` | `editsService.updateLocationField(...)` | `gr-image-metadata.html:503-612` | Four sub-fields edited together in a form; each links to search |
| 36 | Copyright field | InfoPanel / MetadataTab | Joined | `canUserEdit` for write | Shown when `rawMetadata.copyright` has value OR `userCanEdit` | `image.data.metadata.copyright` | `editsService.updateMetadataField('copyright', ...)` | `gr-image-metadata.html:614-665` | Search link on value |
| 37 | Uploaded date | InfoPanel / MetadataTab | RO-pure | None | Single image only (`ctrl.singleImage`) | `image.data.uploadTime` | — | `gr-image-metadata.html:667-672` | Formatted `d MMM yyyy, HH:mm` |
| 38 | Uploader | InfoPanel / MetadataTab | RO-pure | None | Single image only; suppressed when multiple images selected | `image.data.uploadedBy` | Search link: `uploader:value` | `gr-image-metadata.html:674-680` | Displayed with `| stripEmailDomain` filter (strips `@guardian.com` etc.) |
| 39 | Filename | InfoPanel / MetadataTab | RO-pure | None | Single image only, and `extraInfo.filename` non-empty | `image.data.fileMetadata.filename` (via `extraInfo`) | — | `gr-image-metadata.html:682-688` | `select-all-wrap` CSS class; `title` attr shows full name |
| 40 | Subjects chips | InfoPanel / MetadataTab | RO-pure | None | Shown when any selected image has subjects | `image.data.metadata.subjects[]` | Search link per subject | `gr-image-metadata.html:690-701` | Read-only `ui-list-editor-info-panel`; no add/remove |
| 41 | People chips + add button | InfoPanel / MetadataTab | Joined | `canUserEdit` for write (add/remove) | Shown when `userCanEdit` OR any image has people | `image.data.metadata.peopleInImage[]` | Add: `editsService.updateMetadataField('peopleInImage', ...)` Remove: `ctrl.removePersonFromImages(...)` | `gr-image-metadata.html:703-733` | Add button triggers inline edit form |
| 42 | Additional metadata (collapsible) | InfoPanel / MetadataTab | RO-pure | None | Single image; only when `ctrl.metadata` has "useful" keys | Various `image.data.metadata.*` fields not covered by named rows; `image.data.identifiers.*`; `image.data.aliases.*` | Search links | `gr-image-metadata.html:736-786` | `▸ Show / ▾ Hide` toggle. `isUsefulMetadata(key)` filters out fields already shown above |
| 43 | Domain metadata sections (collapsible) | InfoPanel / MetadataTab | Joined | `canUserEdit` for write | Single image; shown per spec in `_clientConfig.domainMetadata[]` | `image.data.metadata.domainMetadata.*` | `editsService.updateDomainMetadataField(...)` | `gr-image-metadata.html:788-920` | Multiple sections possible; field types: string, datetime, integer, select, default(string) |
| 44 | Collections section | InfoPanel / MetadataTab | RO-degraded | None for read; no explicit permission for add-to-collection | Single image only | `image.data.collections[].data.path`, `image.data.collections[].data.pathId` | Search by collection; remove button calls `collections.removeImageFromCollection(...)` | `gr-image-metadata.html:923-966` | Remove button shown inline per collection, no explicit permission guard beyond `userCanEdit` being implicit |
| 45 | Add to collection overlay button | InfoPanel / MetadataTab | Write-only | None (button always rendered; server returns error if disallowed) | Single image only; hidden when `collectionUpdatedByTemplate` | — | Opens collection tree overlay | `gr-collection-overlay.html:1-8` | — |
| 46 | Labels section | InfoPanel / MetadataTab | Joined | None (both add and remove appear unconditionally) | Always shown | `image.data.userMetadata.data.labels[]` | `gr-add-label` / `removeLabelFromImages(...)` | `gr-image-metadata.html:969-985` | `is-editable="true"` — remove always visible; `gr-add-label` always present |
| 47 | Photoshoot field | InfoPanel / MetadataTab | Joined | `canUserEdit` implied (edit button always shown) | Always shown | `image.data.userMetadata.data.photoshoot.data.title` | `photoshootService` save | `gr-image-metadata.html:989-996`, `gr-photoshoot.html:1-20` | Typeahead autocomplete. Edit button (✎) shown without permission guard in template; saving would fail server-side if unauthorised |
| 48 | Syndication rights from RCS | InfoPanel / MetadataTab | RO-pure | None | Single image only | `image.data.syndicationRights` (via `hasSyndicationRights`/`hasRightsAcquiredForSyndication` in imageService) | — | `gr-image-metadata.html:999-1011`, `gr-syndication-rights.js:20-24` | Shows "No information available" when `hasSyndicationRights === false` |
| 49 | Keywords section + add button | InfoPanel / MetadataTab | Joined | `canUserEdit` for write | Shown when `userCanEdit` OR any image has keywords | `image.data.metadata.keywords[]` | Add: `editsService.updateMetadataField('keywords', ...)` Remove: `ctrl.removeKeywordFromImages(...)` | `gr-image-metadata.html:1014-1051` | Add button visible only when `userCanEdit`. Remove chips visible always for `is-editable="true"` |
| 50 | Display crops (collapsible, in metadata panel) | InfoPanel / MetadataTab | RO-pure | None | Only when `singleImage && image.data.exports.length > 0` | `image.data.exports[]` (crop specifications, dimensions, asset file URLs) | Click asset link — download or view | `gr-image-metadata.html:1053`, `gr-display-crops.html:1-30` | `▸ Show / ▾ Hide` toggle. Asset links are download links when `canDownloadCrop` configured |
| 51 | Original image thumbnail (CropPanel) | CropPanel | RO-pure | None | Always shown | `image.data.source.size`, `image.data.thumbnail`, `image.data.source.orientedDimensions` (fallback: `dimensions`), `image.data.id` | `ui-sref="{crop: null}"` selects original | `image/view.html:44-68` | Shows WxH dimensions. Draggable with `asset-handle`. File size shown in heading |
| 52 | Full frame crop thumbnail (CropPanel) | CropPanel | RO-pure | None | `ctrl.hasFullCrop` | `image.data.exports[type='full']` (assets, bounds, author, date) | Click selects full-frame crop | `image/view.html:71-115` | Shows author initials + date in tooltip. Disabled/greyed if crop ratio filter is active and doesn't match |
| 53 | Named crops list (CropPanel) | CropPanel | RO-pure | None | `ctrl.hasCrops` | `image.data.exports[type='crop'][]` (specification.aspectRatio, master.dimensions, assets, author) | Click selects that crop | `image/view.html:117-150` | Each crop shows WxH dimensions. Disabled if crop ratio filter active and ratio doesn't match |
| 54 | Delete ALL crops button (CropPanel) | CropPanel | Write-only | `delete-crops` HATEOAS action on crops resource | `ctrl.active` (set by `mediaCropper.canDeleteCrops(image)`) | `image.data.exports[]` | Window prompt requiring "DELETE" text → `crops.perform('delete-crops')` | `image/view.html:155-158`, `gr-delete-crops.js:18-35` | Two-step confirmation — gr-confirm-delete wrapper + browser prompt with explicit "DELETE" text |
| 55 | Usages tab content (usage list) | InfoPanel / UsagesTab | RO-pure | None | `ctrl.selectedTab === 'usages'` | `image.data.usages.data[]` (status, platform, references, metadata) | — | `image/view.html:169-172`, `gr-image-usage.html:2-7` | Groups: published, pending, removed, downloaded, front (unknown platform). `showSendToPhotoSales` config gate for Capture syndication |
| 56 | Photo sales panel | InfoPanel / UsagesTab | RO-pure | `_clientConfig.showSendToPhotoSales` | `showSendToPhotoSales && hasSyndicationUsages` | `image.data.usages.data[platform='syndication', partnerName='Capture']` | — | `gr-image-usage.html:1`, `gr-image-usage.js:46-54` | React component wrapped via react2angular |
| 57 | Delete All Usages button | InfoPanel / UsagesTab | Write-only | `delete-usages` HATEOAS action on image | `usagesCount > 0 && !(showSendToPhotoSales && hasSyndicationUsages)` | `image.data.usages` | Window prompt requiring "DELETE" → `image.perform('delete-usages')` | `gr-image-usage.html:9-13`, `gr-delete-usages.js:29-45` | Same two-step pattern as Delete Crops. Warns: removes usage records, NOT the image itself |

---

## Section 3 — Permission matrix

| Permission | Elements that appear | Elements that disappear | Elements that change appearance |
|---|---|---|---|
| **`EditMetadata`** (inferred via `image.getLink('edits')` → `editsService.canUserEdit`) | Edit buttons (✎) on Title, Description, Special instructions, Taken on, Byline, Credit, Location, Copyright, Image type, Domain metadata fields; Add buttons for People, Keywords; Leases add button + delete per-lease; Collection remove button; Usage rights edit button | All ✎ edit buttons hidden | "Unknown (click ✎ to add)" → "Unknown" in metadata fields; Leases panel hidden when no leases exist and `!userCanEdit` |
| **`DeleteImage`** (inferred via `image.getAction('delete')` → `imageLogic.canBeDeleted`) | Delete image button in Header | Delete button not rendered | — |
| **`ArchiveImages`** (inferred via `mediaApi.getLink('archive')` → `mediaApi.canUserArchive`) | Add to Library button | Add to Library button not rendered (Kept/Remove states are not permission-gated) | When permission absent, `archivedState='unarchived'` shows nothing (no Add button, no Remove button) |
| **`DeleteCropsOrUsages`** — delete crops (inferred via `crops.getAction('delete-crops')`) | Delete ALL crops button | Button not rendered | — |
| **`DeleteCropsOrUsages`** — delete usages (inferred via `image.getAction('delete-usages')`) | Delete All Usages button | Button not rendered | — |
| **`UploadImages`** | (No element exclusively gated on UploadImages in the image detail view) | — | — |
| **Uploader match** (`uploadedBy === session.user.email`) | Undelete button (together with `canDelete` or `reaped` condition) | — | — |
| **`session.user.permissions.canDelete`** | Undelete button | — | — |
| **No permission required** | All informational display fields (metadata, usages, crops, syndication rights, collections, labels, photoshoot read-view), all banners/notices, Back to search, Share URL, tab switcher, easel image, all thumbnails in CropPanel | — | — |
| **Feature flag `enable-ai-search`** | More like this button | Button not rendered | — |
| **Config `_clientConfig.canDownloadCrop`** | Download selected crop button; download links in gr-display-crops | — | — |
| **Config `_clientConfig.restrictDownload`** | "Cannot download" indicator | Download link | Hidden or shown depending on HATEOAS `download` link |
| **Config `_clientConfig.metadataTemplates`** | Metadata templates selector | — | — |
| **Config `_clientConfig.imageTypes`** | Image type selector | — | — |
| **Config `_clientConfig.showSendToPhotoSales`** | Photo sales panel | — | — |
| **Config `_clientConfig.domainMetadata`** | Domain metadata sections | — | — |
| **Config `_clientConfig.showDenySyndicationWarning`** | Deny-syndication warning in validity banner | — | — |

---

## Section 4 — Conditional render rules

These are data-driven show/hide rules that are **not** permission-based.

| # | Rule | Element | Source (file:line) |
|---|---|---|---|
| 1 | `image.data.softDeletedMetadata !== undefined` | Suppresses Download button; changes Archiver to "Image Deleted"; hides Crop button; validity banner shows deletion-specific text; Delete image button hidden | `gr-downloader.js:39-46`, `gr-archiver.html:12-19`, `gr-crop-image.js:22-23`, `gr-metadata-validity.js:17`, `image/view.html:21` |
| 2 | `image.data.usages.data` contains entry with `status === 'replaced'` | Replaced-by warning banner | `image/view.html:171-176`, `image/controller.js:162-164` |
| 3 | `image.data.valid === false` (and `usageRights` key count matters) | Validity banner shown with `showInvalidReasons`; Crop button hidden | `gr-metadata-validity.js:22-28`, `gr-crop-image.js:22` |
| 4 | `image.data.usageRights.usageRestrictions` present | Restricted-use cost banner; validity banner also shows restrictions text | `gr-image-cost-message.js:22`, `gr-metadata-validity.js:32` |
| 5 | `image.data.leases.data.leases[]` contains active `deny-syndication` lease AND `_clientConfig.showDenySyndicationWarning` | Deny-syndication warning in validity banner | `gr-metadata-validity.js:18-19` |
| 6 | `image.data.leases.data.leases[]` contains active `allow-use` lease | Validity banner colour changes from invalid→leased-override (green) when `!isStrongWarning` | `gr-metadata-validity.js:29-30`, `gr-metadata-validity.html:2-6` |
| 7 | `image.data.persisted.value === true` | Archiver shows "Remove from Library" instead of "Add to Library" | `gr-archiver.js:62-64`, `image-logic.js:24` |
| 8 | `image.data.persisted.reasons` contains anything other than `['archived']` | Archiver shows "Kept in Library" (non-interactive) instead of Remove/Add | `image-logic.js:22-26`, `gr-archiver.html:3-10` |
| 9 | `mediaCropper.getCropsFor(image)` result: `crops[type='full']` exists | Full frame crop section in CropPanel | `image/view.html:70`, `image/controller.js:290` |
| 10 | `mediaCropper.getCropsFor(image)` result: `crops[type='crop'].length > 0` | Named crops list in CropPanel | `image/view.html:116`, `image/controller.js:291` |
| 11 | `ctrl.usagesCount === 0` | Usages tab disabled (greyed out, non-clickable) | `image/controller.js:185-189` |
| 12 | `image.data.syndicationRights` present (via `imageLogic.hasSyndicationRights`) | Syndication rights section shows "rights acquired" or "not acquired" vs "No information" | `gr-syndication-rights.js:21-22` |
| 13 | Single image selected (vs multi-image context from search) | Uploaded date, Uploader, Filename, Syndication rights, Metadata templates (if single), Collections displayed; multi-image-specific text ("Multiple X") shown otherwise | `gr-image-metadata.html:667`, `gr-image-metadata.js:435` |
| 14 | `image.data.userMetadata.data.leases.data.leases.length > 0` OR `userCanEdit` | Leases panel shown | `gr-image-metadata.js:518` |
| 15 | `image.data.metadata.byline` has value OR `userCanEdit` | Byline row shown | `gr-image-metadata.html:389` |
| 16 | `image.data.metadata.copyright` has value OR `userCanEdit` | Copyright row shown | `gr-image-metadata.html:613` |
| 17 | `image.data.metadata` has "useful" non-standard keys | Additional metadata collapsible section shown | `gr-image-metadata.html:736`, `gr-image-metadata.js:isUsefulMetadata` |
| 18 | `image.data.exports.length > 0` (via `ctrl.hasCrops` logic) | Display crops collapsible in metadata panel | `gr-image-metadata.html:1053` |
| 19 | `_clientConfig.metadataTemplates !== undefined && metadataTemplates.length > 0` | Metadata templates selector shown | `gr-image-metadata.js:59` |
| 20 | `_clientConfig.imageTypes.length > 0` | Image type selector shown | `gr-image-metadata.js:66` |

---

## Section 5 — Joined-component seams

| # | Element | Read part | Write part | Coupling in kahuna | Potential seam |
|---|---|---|---|---|---|
| 1 | Usage rights | `usage-rights-summary` React component (or plain text `usageCategory`) showing current category | `gr-usage-rights-editor` overlay component; toggled by `showUsageRights` boolean | Edit button sets `ctrl.showUsageRights = true`; editor emits `gr-on-save` / `gr-on-cancel` which sets it back to `false`. Entire read+write is in one `<dl>` block. | Clean seam: read part is a read-only text/component; write part is the editor component. Can split as `<UsageRightsDisplay>` + `<UsageRightsEditor>`. |
| 2 | Image type | `editable-select` in display state (shows value text) | Same `editable-select` widget becomes a `<select>` dropdown in edit state. Angular-xeditable manages the toggle. | The read display IS the xeditable widget — they are the same DOM element in two modes. | Seam requires rendering choice: either keep the xeditable pattern or split into two conditional elements (display span + select). |
| 3 | Title / Byline / Credit / Copyright / Location (all simple text fields) | Static `<dd>` with search link | `editable-text` / `editable-datetime-local` xeditable widget triggered by ✎ button | Same pattern as #2 — xeditable uses the same element for read/write; ✎ button is separate from the widget. | Clear seam: ✎ button can remain a toggle; render a read-only span or write input depending on `editing` state. Clean kupua split. |
| 4 | Description / Special instructions | `<dd>` with plain text | `editable-textarea` (xeditable); extra radio-list for multi-image description conflict resolution | Description has additional `checkDescriptionLength()` call and a multi-image option picker (`gr-radio-list`) within the form. More complex than simple text fields. | Seam: same as above for the text widget; the multi-image conflict UX is a separate concern. |
| 5 | People chips | `ui-list-editor-info-panel` in display mode (chips with remove ✕) | Same component with `is-editable="true"` plus an Add button + hidden xeditable form | The remove action is part of the chip itself; add uses a hidden form triggered by the + button. Both are in `ui-list-editor-info-panel`. | Seam: pass `editable` prop; kupua could make removal conditional on `canEdit` while always rendering chips. |
| 6 | Keywords chips | Same as People (#5) | Same as People (#5) | Same | Same as #5 |
| 7 | Photoshoot | Clickable `<a>` with title | `editable-text` with typeahead autocomplete (uib-typeahead) | ✎ button triggers xeditable; same element in two modes. | Seam: straightforward display/edit toggle; typeahead is the interesting part. |
| 8 | Leases | List of `<li>` items (access type, dates, notes) with per-lease delete button | Add-lease form (`<form class="lease__form">`) with access type select, date pickers, notes, save/cancel | Add form is a sibling of the list, shown via `ctrl.editing = true`. Delete-per-lease uses `gr-confirm-delete` inline in each `<li>`. | Seam: lease list component + separate lease form; delete action within each lease item. kupua could implement list-with-delete as read mode, separate AddLeaseForm as write mode. |
| 9 | Collections | List of `<a>` links with remove button per collection | `gr-collection-overlay` component (tree picker) triggered by add button | Remove is inline per collection (no modal); Add opens an overlay. Both render in the same `<dd>`. | Seam: inline remove per item is tightly coupled to item display. kupua could render chips that conditionally show remove ✕. |

---

## Section 6 — Out-of-scope appendix (≤15 items)

Elements noticed during audit that fall outside `GET /images/{id}` or outside the image detail view scope:

| # | Item | Note |
|---|---|---|
| 1 | Keyboard shortcut `c` → crop | Registered globally on detail view; belongs to navigation layer | `image/controller.js:116` |
| 2 | Keyboard shortcut `f` → fullscreen | Same; browser Fullscreen API | `image/controller.js:123` |
| 3 | `mediaCropper.getCropsFor(image)` fetch | Follows HATEOAS link `crops` — separate request from `GET /images/{id}` | `image/controller.js:261` |
| 4 | `imageUsagesService.getUsages(image)` stream | Follows `image.usages` sub-resource; reactive Rx stream | `image/controller.js:170-178` |
| 5 | `mediaApi.getSession()` | Session endpoint used for archive permission and uploader match | `image/controller.js` via archiver |
| 6 | `_clientConfig.rootUri` | Server-injected config used for Share URL; not from image response | `image/controller.js:218` |
| 7 | `_clientConfig.agencyPicksIngredients` | Config-driven field matching for `isAgencyPick`; not a UI element on this screen but feeds into `imageLogic` | `image-logic.js:46-55` |
| 8 | `$rootScope.$emit('images-updated')` / `images-deleted` events | Cross-component event bus; image refreshes live when edited elsewhere | `image/controller.js:308-322` |
| 9 | Crop creation from Crop view | `ui-sref="crop"` navigates away; `gr-export-original-image` also triggers crop route | Out of scope (crop screen) |
| 10 | `asset-handle` web component on thumbnails | Carries structured data for external (non-Grid) drag consumers; likely CMS-specific contract | `image/view.html:62-67` |
| 11 | `gr-metadata-templates` component | Applies a preset bundle of metadata+usageRights+collections+leases from `_clientConfig`; itself fetches from a metadata templates endpoint | `gr-image-metadata.html:5` |
| 12 | `gr-leases` with `withBatch` mode (upload flow) | Batch-apply-to-all and batch-remove-all buttons exist in `leases.html` but are only activated from the upload flow, not the detail view | `leases/leases.html:14-28` |
| 13 | `gr-collection-tree` hierarchy | Full collection hierarchy fetched from collections endpoint, not `GET /images/{id}` | `gr-collection-overlay.html:35-40` |
| 14 | `gr-description-warning` component | Imported in `gr-image-metadata.js` but not visible in the HTML template scan; likely a soft-validation notice | `gr-image-metadata.js:8` |
| 15 | `gr-usagerights-summary` React component | Multi-image usage rights display; pulls from `ctrl.selectedImages` (Immutable List), not a single image response | `gr-image-metadata.html:35`, `gr-image-metadata.js:16` |
