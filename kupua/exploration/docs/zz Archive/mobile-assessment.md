# Kupua Mobile Assessment

## Preamble: Is this within my competence?

Yes — fully. I can audit the code, identify every mobile-hostile pattern, and propose concrete fixes with effort estimates. The actual *implementation* is a large body of work (I'd estimate 3–5 focused sessions), but the assessment itself is straightforward given how well-structured the codebase is.

Before diving in, one **push-back** per my directives: mobile support for a DAM tool used by editorial staff is a *nice-to-have* for quick triage/browsing, not a primary use case. Nobody is going to edit metadata, manage crops, or do serious curation on a phone. The right framing is **"make browsing and image lookup usable on mobile"**, not "make Kupua a fully functional mobile app." That scoping decision affects every trade-off below. I'll flag where "mobile-first" work would compromise the desktop experience or add disproportionate complexity.

---

## Issue Inventory

### 1. 🔴 Pull-to-Refresh Hijacks Scroll

**What happens:** Scrolling down in the grid/table triggers the browser's native pull-to-refresh (Chrome/Android). This is because the scroll container is a child `<div>` — the browser sees the page itself as not scrolled and interprets the overscroll as a refresh gesture.

**Root cause:** `__root.tsx` uses `h-screen w-screen overflow-hidden` on the root div. The actual scroll happens inside `ImageGrid`/`ImageTable`'s inner container. Chrome's pull-to-refresh fires when a scrollable area has `scrollTop === 0` and the user pulls down.

**Fix:** Add `overscroll-behavior-y: contain` on the scroll container elements (`ImageGrid`'s `parentRef` div, `ImageTable`'s scroll container). This is a one-line CSS change per component.

**Effort:** Trivial. 5 minutes.

---

### 2. 🔴 Sticky Toolbar + Android URL Bar = Layout Thrashing

**What happens:** On Android Chrome, the browser URL bar hides/shows as the user scrolls. Kupua's root layout uses `h-screen` (which resolves to `100vh`), but `100vh` on mobile doesn't account for the dynamic URL bar — the bottom of the page is hidden behind the URL bar when it's visible. When it hides/shows, `100vh` changes, causing the whole layout to resize.

**Root cause:** `__root.tsx` → `h-screen` (= `100vh`). This is the classic mobile web trap.

**Fix:** Replace `h-screen` with `h-dvh` (Tailwind 4 ships this — `dvh` = dynamic viewport height, supported in all modern mobile browsers since 2023). The `SearchBar` header (`h-11`) and `StatusBar` (`h-7`) are both `shrink-0`, which is correct — they won't collapse. The remaining flex child fills the rest.

**Effort:** Trivial. One class change. But needs testing on real Android — `dvh` has some edge cases with certain keyboard-open states.

---

### 3. 🟡 "New Images" Ticker Overflows at Large Font Sizes

**What happens:** The ticker button (`"{N} new"`) in `StatusBar.tsx` uses `text-sm leading-tight` and `self-center`. When the system font size is scaled up (Android accessibility settings, or iOS Dynamic Type), the text wraps to two lines, bulging out of the 28px (`h-7`) status bar.

**Root cause:** Fixed `h-7` height on the status bar with no `overflow-hidden` or `min-h-7` + `flex-wrap` strategy.

**Fix (progressive):**
- **Quick:** Add `whitespace-nowrap` to the ticker button (it already has it on most other toolbar items). Truncate with `overflow-hidden text-ellipsis` if needed.
- **Better:** Make the status bar `min-h-7` instead of `h-7`, allow it to wrap gracefully. But this affects desktop layout — every pixel counts in the chrome-to-content ratio.
- **Best:** Use `clamp()` or `max()` for font sizing in the status bar so it scales down when space is tight. Combined with `whitespace-nowrap`, this keeps the bar at 28px.

**Effort:** Small. 15 minutes for the quick fix.

---

### 4. 🔴 Image Detail: Metadata Panel Covers Everything

**What happens:** `ImageDetail.tsx` renders as a `flex-row` — image on the left, metadata sidebar (`w-72 shrink-0`) on the right. On a phone screen (360–414px), the 288px sidebar leaves 72–126px for the image. The image is effectively invisible.

**Root cause:** The sidebar is `w-72 shrink-0` with no responsive breakpoint. There's no way to hide it on mobile.

**Fix:** This is the single biggest mobile issue and needs a thoughtful solution:

- **Option A — Stack vertically on small screens:** Below a breakpoint (e.g. `md` = 768px), switch the detail view to a vertical layout: image on top (full width, `max-h-[60vh]`), metadata scrollable below. The image becomes the hero. This is how most mobile image viewers work.

- **Option B — Tabs/Drawer:** Image fills the screen. Metadata is in a bottom sheet / drawer that the user can pull up. More "app-like" but significantly more complex.

- **Option C — Toggle:** A button to show/hide the sidebar, defaulting to hidden on mobile. Simplest code change, but least discoverable.

**Recommendation:** Option A. It's the least surprising, requires no new interaction patterns, and works well with the existing code structure. The `flex-row` → `flex-col` switch is a responsive utility class. The sidebar becomes a scrollable section below the image.

**Effort:** Medium. 1–2 hours. Needs careful handling of the fullscreen transition and prev/next button positioning.

---

### 5. 🔴 Double-Tap to Enter is Hostile on Mobile

**What happens:** Opening an image from the grid requires a double-click (`onCellDoubleClick`). On mobile, double-tap triggers the browser's zoom gesture. Even if zoom is disabled, the 300ms delay before the second tap feels sluggish and confusing.

**Root cause:** Desktop interaction pattern (single-click = focus, double-click = open) doesn't translate to touch. On mobile, there's no hover and no concept of "focus without opening."

**Fix:** On touch devices, single tap should open the image detail view directly. The "focus" concept (blue ring, metadata in right panel) is meaningless on mobile since:
- The right panel is hidden on mobile (it should be, per issue #4 above)
- There's no keyboard navigation
- There's no hover state

**Implementation approaches:**
- **Detect touch:** Use `@media (pointer: coarse)` or `'ontouchstart' in window` to switch the click handler. Single tap → open detail.
- **Alternative:** Keep single-tap = focus (brief highlight), but add a visible "tap to view" affordance, and have the focused state auto-navigate to detail after ~200ms. This is more complex and slower.

**Recommendation:** `pointer: coarse` media query to switch to single-tap-to-open. Clean, progressive, no JS detection needed.

**Effort:** Small–Medium. 30 minutes. The tricky bit is not breaking desktop behavior.

---

### 6. 🟡 Prev/Next Buttons in Image Detail are opacity-0

**What happens:** The prev/next buttons in `ImageDetail.tsx` are `opacity-0 hover:opacity-100`. On touch devices, there's no hover — the buttons are invisible and undiscoverable. The user has to know to swipe or tap exactly the right spot.

**Root cause:** Desktop hover pattern.

**Fix:** On touch devices (`@media (pointer: coarse)`), make the buttons always visible at low opacity (e.g. `opacity-60`). Also: add swipe gesture support for prev/next (see issue #7).

**Effort:** Small. 15 minutes for visibility. Swipe is separate.

---

### 7. 🟡 No Swipe Gestures

**What happens:** In image detail, there's no way to swipe left/right to navigate between images. This is the *expected* interaction on mobile — every photo gallery app supports it.

**Root cause:** Only keyboard (`ArrowLeft`/`ArrowRight`) and click (prev/next buttons) are implemented.

**Fix:** Add touch swipe detection in `ImageDetail.tsx`. Can be done with a simple `touchstart`/`touchend` delta calculation (no library needed — ~30 lines of code). Threshold: 50px horizontal, less than 30° from horizontal.

**Effort:** Small. 30 minutes.

---

### 8. 🟡 SearchBar Toolbar Too Crowded on Mobile

**What happens:** `SearchBar.tsx` has: logo (44px) + search input + filters (hidden `md:flex`, good!) + sort controls (hidden `sm:flex`) + ES timing display. On a narrow phone, the search input gets squeezed, and the ES timing (which nobody needs on mobile) wastes space.

**Root cause:** Most items already have responsive breakpoints, but the ES timing span and logo are always visible.

**Fix:**
- Hide ES timing below `sm` (or always on `pointer: coarse`)
- The logo is fine (44px isn't much)
- Search input already has `flex-1 min-w-0`, which is correct
- Sort controls are hidden below `sm` — already good
- Consider collapsing the search bar chrome (smaller padding, tighter layout) on mobile

**Effort:** Trivial. 10 minutes.

---

### 9. 🟡 Scrubber Not Touch-Friendly

**What happens:** The scrubber is 14px wide with a 3px-inset thumb. On touch, this is too narrow to grab reliably. The mouse-based hover → tooltip interaction doesn't work on touch.

**Root cause:** Designed for mouse precision.

**Fix:**
- Widen the scrubber hit target on touch devices (e.g. 24px width with larger thumb)
- The scrubber already uses `onPointerDown` (which handles touch), and `setPointerCapture`, so the drag mechanics should work — it's just the target size that's problematic
- Consider hiding the scrubber on mobile and replacing it with a simpler "pull to load more" or "jump to date" button. The scrubber's value proposition (seeing your position in 9M images) is desktop-oriented.

**Recommendation:** Hide the scrubber on narrow viewports, keep infinite-scroll-style loading. The scrubber is a power-user tool.

**Effort:** Small. 20 minutes to hide. Much more if adding a mobile-specific alternative.

---

### 10. 🟠 PanelLayout Panels on Mobile

**What happens:** Left and right panels are resizable side panels (280px and 320px defaults). On mobile, opening either panel leaves almost no room for content. The resize handles use mouse-only events.

**Root cause:** Desktop-oriented 3-column layout.

**Fix:** On mobile viewports:
- Auto-hide both panels
- If the user opens a panel, show it as a full-screen overlay / bottom sheet rather than a side column
- Or: simply disable panel toggles on mobile (the Browse and Details buttons in the status bar). The filters are less useful on mobile anyway.

**Recommendation:** Auto-hide panels on mobile, disable the toggle buttons, and show a simplified filter/sort UI in the search bar area if needed.

**Effort:** Medium. 1 hour for hiding + disabling. Much more for overlay/sheet pattern.

---

### 11. 🟢 Table View Unusable on Mobile

**What happens:** Table view (`density=table`) with horizontal scroll doesn't work well on narrow screens. Columns are truncated, horizontal scrolling is awkward with touch.

**Root cause:** Table view is inherently a wide-screen interface.

**Fix:** Force grid view on mobile. Add `if (isMobile) density = undefined` logic, or hide the density toggle on mobile.

**Effort:** Trivial. 5 minutes. Debatable whether it's worth forcing — some users might prefer table.

---

### 12. 🟢 Fullscreen API Doesn't Work on iOS Safari

**What happens:** `requestFullscreen()` is not supported on iPhone Safari (iPads are fine). The `f` key shortcut for fullscreen does nothing. This is a Safari limitation, not a Kupua bug.

**Root cause:** Apple doesn't support the Fullscreen API on iPhone.

**Fix:** On iOS, hide the fullscreen affordance. The image detail view already works fine without fullscreen — the image fills most of the screen in the stacked mobile layout (Issue #4 fix).

**Effort:** Trivial. Add a feature detection check.

---

### 13. 🟡 `h-screen` and Virtual Keyboard

**What happens:** When the CQL search input is focused on mobile, the virtual keyboard pops up, reducing viewport height. With `h-screen` (100vh), the layout doesn't reflow — content gets pushed behind the keyboard.

**Root cause:** Same as Issue #2 — `100vh` doesn't account for the keyboard.

**Fix:** `h-dvh` (from Issue #2) partially helps. Additionally, when the search input is focused on mobile, the image grid should still be scrollable and not collapse to zero height. The `flex-1 min-h-0` pattern is correct for this.

**Effort:** Covered by Issue #2 fix + testing.

---

### 14. 🟢 Touch Target Sizes

**What happens:** Several interactive elements are smaller than the recommended 44×44px touch target (WCAG 2.2 / Apple HIG):
- The density toggle icons in StatusBar (14×28px hit area)
- Clear search button (small)
- Checkbox for "Free to use only" (14×14px, but hidden on mobile — fine)
- Column context menu items in table view (mostly irrelevant if table is disabled)

**Root cause:** Designed for mouse.

**Fix:** Ensure all visible-on-mobile interactive elements have at least 44×44px touch targets (can use padding, not visual size).

**Effort:** Small. Audit + padding adjustments. 20 minutes.

---

## Summary: Effort vs Impact Matrix

| # | Issue | Severity | Effort | Impact |
|---|-------|----------|--------|--------|
| 1 | Pull-to-refresh | 🔴 Critical | 5 min | Fixes the most annoying single bug |
| 2 | `h-screen` / URL bar | 🔴 Critical | 10 min | Fixes layout thrashing on every scroll |
| 5 | Double-tap to enter | 🔴 Critical | 30 min | Makes the app actually usable |
| 4 | Metadata panel covers image | 🔴 Critical | 1–2 hr | Makes image detail actually usable |
| 6 | Invisible prev/next buttons | 🟡 Significant | 15 min | Quick win |
| 7 | No swipe gestures | 🟡 Significant | 30 min | Expected mobile pattern |
| 3 | Ticker overflow | 🟡 Significant | 15 min | Quick win |
| 8 | Toolbar clutter | 🟡 Significant | 10 min | Quick win |
| 9 | Scrubber too narrow | 🟡 Significant | 20 min | Simplifies mobile layout |
| 10 | Panels on mobile | 🟠 Moderate | 1 hr | Prevents accidental broken layout |
| 11 | Table view | 🟢 Minor | 5 min | Edge case |
| 12 | Fullscreen on iOS | 🟢 Minor | 5 min | Edge case |
| 13 | Virtual keyboard | 🟢 Minor | (in #2) | Covered by `dvh` fix |
| 14 | Touch targets | 🟢 Minor | 20 min | Accessibility improvement |

**Total estimated implementation time:** ~5–6 hours of focused work for all issues.

---

## Recommended Implementation Order

**Phase 1 — "Stop the bleeding" (quick wins, ~1 hour):**
1. `overscroll-behavior-y: contain` (Issue 1)
2. `h-dvh` (Issue 2)
3. `whitespace-nowrap` on ticker (Issue 3)
4. Hide ES timing on small screens (Issue 8)
5. Make prev/next visible on touch (Issue 6)

**Phase 2 — "Actually usable" (~2 hours):**
6. Mobile image detail layout (Issue 4) — the big one
7. Single-tap-to-open on touch (Issue 5)
8. Swipe gestures (Issue 7)

**Phase 3 — "Polish" (~1 hour):**
9. Hide/disable panels on mobile (Issue 10)
10. Hide scrubber on mobile (Issue 9)
11. Force grid view on mobile (Issue 11)
12. Fullscreen detection (Issue 12)
13. Touch target audit (Issue 14)

---

## Open Questions

1. **Do you want a `useIsMobile()` hook or CSS-only approach?** Most fixes can be pure CSS (`@media (pointer: coarse)` or `@media (max-width: ...)`). A JS hook would be needed for behavior changes (single-tap, swipe). I'd recommend both: CSS for layout, a small hook for interaction mode.

2. **Breakpoint strategy:** Tailwind's `sm` (640px) and `md` (768px) are already in use. Should mobile be `< sm` or `< md`? Phones are typically < 430px CSS width, small tablets 768px. I'd suggest `< sm` for "phone-only" changes and `< md` for "touch device" changes.

3. **Should table view be accessible on mobile at all?** It's inherently wide-screen. Forcing grid is simpler but opinionated.

4. **What about landscape phone?** Landscape gives ~700px width — enough for the current layout minus panels. The stacked detail view might feel awkward in landscape. Worth considering but probably not worth optimizing for in Phase 1.

