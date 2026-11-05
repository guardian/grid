# Compact Shell — Design

The compact shell is Kupua's phone experience: content first, with every action still
reachable. Implementation details live in the
[component reference](../00%20Architecture%20and%20philosophy/component-detail.md#compact-shell-hooksuseshellts-componentsbottomsheettsx-componentsfilterssheettsx).

## Principles

- **Shell, not a separate app.** Buffer, scrolling, focus, selection and history are shared.
  Only chrome forks: search entry, panels versus sheets, toolbar versus floating actions.
- **Touch decides the shell.** It applies to narrow (≤639px) coarse-pointer viewports. A narrow
  desktop window keeps desktop behaviour, because cards and sheets make little sense with a
  mouse and click-to-focus. Width alone still collapses toolbar controls (below).
- **Content is the default view; power appears where the user is focused.**
- **Restrained motion.** Only meaningful transitions animate, in the style of the new-results and
  phantom-focus animations.
- **Touch targets ≥44px.**
- **Engine safety.** One results viewport. Chrome overlays content and never resizes it
  mid-gesture; crossing the breakpoint never remounts the list. The scroll container and geometry
  singletons are untouched.

## Layout

- **Top bar.** Search field showing only free text, plus a filters button with a chip-count badge.
  The full query is never lost: field terms live as chips.
- **Refine sheet.** Opens below the bar: chips (tap key to negate, tap value to edit, × to remove,
  "+ Add filter"), free-to-use, sort and dates, with Reset and "Show N results". Pull down or tap
  the scrim to dismiss. CQL remains the advanced path.
- **Panels become sheets.** The left panel slides in over a scrim and swipes away. The right panel
  exists only as the selection card.
- **Status bar.** 38px tall; tickers collapse to counts below 600px; a single density button cycles
  Justified → Grid → Table below 500px.
- **Scrubber.** A ≥44px touch hit area around the thin visible strip.
- **No bottom action bar.** It would permanently take prime space. Selection actions live in the
  floating action button, which expands into a small labelled menu.
- **Bottom card.** One peek/expand pattern for metadata: the selection's details in selection mode,
  the image's metadata in detail view. The detail card has no scrim so the image stays usable;
  expanding it shrinks the image into the top quarter, and tapping the image collapses it.

## Gestures

- **Tap opens detail; long-press selects.** There is no long-press peek; metadata comes from the card.
- **Drag-select.** After a long-press, dragging selects the range from origin to finger; dragging back
  releases what this drag added. Starting on a selected image erases instead. Dragging near an edge
  auto-scrolls. Ranges crossing unloaded results are completed on release.
- **Pull to refresh** at the top of results (off while a selection exists).
- **Pinch on results** steps one zoom level per deliberate pinch, anchored to the image under the
  fingers. Pinch in detail/fullscreen zooms the image.

## Results zoom and the Home view

Justified is the default density on touch devices. Each density zooms through six width-aware
levels; default zoom is always the classic geometry. Zoom is available by pinch, `+`/`-`/`0`
and the Settings menu. "Lock this view" makes the current density and zoom the Home view for
Home and new tabs; it is an explicit choice, not remembered implicitly.

## Desktop counterparts

Some compact-shell ideas apply to all widths and pointers:

- Below 760px, free-to-use, date and sort collapse behind the filters button into a dropdown under
  the search bar (no chips; the editor already shows the full query).
- Results zoom, the Settings zoom row, Lock this view and whole-app fullscreen.

## Not pursued

- **A desktop "compact layout" preference.** Cards and sheets serve touch; on desktop they conflict
  with click-to-focus and add little. The shell switch is a single function, so revisiting this is
  cheap if a real need appears.
- **Side-by-side densities.** Density state is a set of module singletons with one position owner.
- **Canvas/WebGL rendering.** The bottlenecks are seeks, transfer and decode, not DOM paint.

## Open items

- iOS Safari is untested; it has no element fullscreen, so fullscreen controls do nothing there.
- Recent/saved searches would belong in a left-panel "Places" tab in both shells.
- Results scrolling under a translucent top bar, and provenance borders/badges in Justified.
- Thumbnails look soft at the largest zoom levels until a larger thumbnail rendition exists.
