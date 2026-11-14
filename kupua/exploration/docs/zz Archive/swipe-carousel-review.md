# Swipe Carousel — Critical Review

> Review of the mobile swipe carousel after the two-day duplicate-image bug
> investigation. Reviewer: fresh agent (Opus 4.7), no prior involvement in
> the work. Files inspected: `useSwipeCarousel.ts`, `StableImg.tsx`,
> `image-prefetch.ts`, `image-urls.ts`, `ImageDetail.tsx` (carousel section),
> `swipe-diag.ts`, `SwipeDiagButton.tsx`, plus the worklog.
>
> Tone: deliberately critical, as requested. Praise is in the worklog and
> commit history; this doc focuses on what is fragile, redundant, or
> outright wrong, and where the real performance wins are.

---

## TL;DR

The fix works on the phone. That is not nothing — it took a real fight.
But the shipped solution is a stack of **four overlapping mechanisms**, two
of which are based on a premise that was disproved during the investigation
and not removed. There is one mid-sized correctness issue, several stale or
load-bearing assumptions, and ~4 clear performance wins that cost almost
nothing to take.

The most important things to fix, in priority order:

1. **Diagnostics are NOT free.** `diagStartFrameTracker` calls
   `getComputedStyle()` on every animation frame — that forces synchronous
   layout. It runs on every committed swipe regardless of whether the
   overlay is open. Remove it or gate it on a runtime flag before shipping.
2. **`_loadedFullRes: Map<string, HTMLImageElement>` is built on a theory
   that you yourselves disproved.** Worklog says explicitly: *"Chrome does
   NOT share decoded bitmaps between Image objects."* Yet the Map still
   stores Image objects (with the comment claiming the opposite), and
   `markFullResLoaded` even stores a *dummy* `new Image()` that holds no
   bitmap at all. Should be `Set<string>`. Reclaims ~30 × screen-AVIF of
   memory on phone for nothing.
3. **The "keyed side panels" the worklog describes as the fix were never
   actually shipped.** The JSX for prev/next has no `key` prop. The fix
   that's actually doing the work is `removeAttribute("src")` in
   `commitStripReset` plus the `data-thumb` fallback at COMMIT. The doc
   comment on `useSwipeCarousel.ts` lines 21–24 lies about this.
4. **Same image is decoded 2–3× per navigation.** This is the perf headline
   you asked about, and it has real solutions — see §3.

---

## 1. Mechanisms currently in play (what's actually doing the work)

The shipped fix is the union of four things layered on top of each other:

| # | Mechanism | Where | Purpose | Verdict |
|---|---|---|---|---|
| A | **`commitStripReset` copies target src to center, clears side srcs, resets transform** | `useSwipeCarousel.ts:48-101` | Make the "swiped to" image visible the instant the strip snaps back to translateX(0). Blank > stale on side panels. | **Load-bearing. Keep.** |
| B | **`StableImg` guards against redundant React `src` writes** via URL comparison + `data-committed` flag | `StableImg.tsx` | Stop React from re-setting the same URL after `commitStripReset` already did it imperatively (which would reset `img.complete` and trigger re-decode). | **Load-bearing for the "same imageId, different imgproxy URL" race.** Keep. |
| C | **COMMIT-time `data-thumb` fallback** | `useSwipeCarousel.ts:243-263` | If the about-to-slide-in panel hasn't decoded its full-res, swap to the pre-cached thumbnail JPEG before WAAPI starts. | **The actual fix for the "duplicate image" bug.** Keep. |
| D | **Prefetch pipeline + `_loadedFullRes` Map + `onFullResDecoded` listeners** drives side-panel URL choice (full-res when decoded, thumb when not) | `image-prefetch.ts`, `ImageDetail.tsx:421-461` | Lets slow swipes show full-res in the side panel during the slide. | **Half-broken** (see §2.2). The Set part works; the Image-keepalive part is theatre. |

**A**, **B**, and **C** form the actual safety net. **D** is an optimisation
that lets you skip showing the thumbnail on slow swipes — useful, but the
implementation has cruft.

---

## 2. Issues, in order of severity

### 2.1 Diagnostics ship as production code and are not free

`useSwipeCarousel.ts` calls `diagLog`, `diagPanelSrcs`, and
`diagStartFrameTracker` unconditionally on every commit. `StableImg`,
`ImageDetail`, and `image-prefetch` likewise have `diagLog` calls in hot
paths.

- `diagPanelSrcs(strip)` does `Array.from(strip.children)` + `querySelector`
  + URL regex per panel — called at TOUCH-START, COMMIT, RESET-BEFORE,
  RESET-AFTER, ANIM-DONE, CB-DONE. That's six DOM walks per swipe.
- `diagStartFrameTracker` runs `requestAnimationFrame` for the whole
  animation and calls `getComputedStyle(strip).transform` every 3rd frame.
  **`getComputedStyle()` flushes pending layout** — exactly the kind of
  synchronous reflow you spent half the worklog blaming for the bug.
- `diagLog` itself is cheap (string + array push), but the sites that
  *build* its arguments (template literals with `.match(/.../)?.[1]?.slice`)
  do real work even when nothing reads the log.

The worklog asserts "Zero runtime cost in normal operation." That's wrong.
The cost is not catastrophic — but you are running diagnostics on every
single mobile swipe in production. Three options, in order of preference:

1. **Strip the diagnostics entirely** before merging. The bug is fixed; the
   `SwipeDiagButton` and `swipe-diag.ts` were always intended to be
   temporary (the file header says so).
2. If you want to keep them as a debugging tool, gate every site behind
   `if (DIAG_ENABLED)` where `DIAG_ENABLED` is a `const` set from
   `import.meta.env.DEV` or a localStorage flag, so V8 dead-code-eliminates
   the call sites in production builds. Do not rely on `diagLog` being a
   no-op — the *argument expressions* still execute.
3. At minimum, remove `diagStartFrameTracker` — that's the only one with
   a measurable per-frame cost.

This is the single cheapest perf win on the table.

### 2.2 `_loadedFullRes: Map<string, HTMLImageElement>` is based on a disproved theory

The Map exists because someone hypothesised that holding the prefetch
`Image` object alive would prevent Chrome from evicting its decoded bitmap,
so a later DOM `<img>` with the same URL would paint synchronously.

Worklog, verbatim: *"CRITICAL DISCOVERY: Chrome does NOT share decoded
bitmaps between Image objects. The Map<string, HTMLImageElement> approach
was based on the assumption that keeping prefetch Image objects alive
would help DOM `<img>` elements decode faster (shared bitmap cache).
WRONG."*

Yet:

- `image-prefetch.ts:43-49` still has the doc comment describing the
  (debunked) bitmap-keepalive strategy.
- The Map still stores `HTMLImageElement` values — pointlessly. Each entry
  pins a screen-sized AVIF bitmap (~400KB at DPR 2 on iPhone) in memory
  for 30 entries → up to ~12MB of dead memory on phone.
- `markFullResLoaded()` (called from the **center panel's** `onLoad`)
  inserts `new Image()` — an *empty* Image object, never given a `src`.
  This is meaningless: the entry serves only as a tombstone saying "this
  ID has been seen". So the Map is already mixed: real prefetch Images
  + dummies. The dummies even count toward the FIFO eviction cap, so
  hitting the center 30 times will evict legitimate prefetched neighbours.

**Fix:** change `_loadedFullRes` to `Set<string>`. Drop the FIFO cap, or
keep it as a Set with size limit. Update the doc comment. ~10 lines, zero
behavioural change, frees memory and removes a misleading comment that the
next agent (or you, in 6 months) will believe.

### 2.3 The "keyed panels" fix described in the worklog and in `useSwipeCarousel.ts:18-24` was never shipped

Doc comment on the hook says:

> *"Side panels use React `key` props (keyed by image ID) so React creates
> fresh `<img>` elements on navigation — no old pixels to show as stale
> compositor textures during swipe animation."*

The JSX at `ImageDetail.tsx:621-700` has no `key` prop on the prev/next
panel divs. They are conditionally rendered (`{prevImageUrl && (...)}`),
which only unmounts on URL→undefined transitions, **not** when navigating
from image A to image B (both have prev images → React reuses the DOM
node).

So the comment in the hook is straightforwardly false. Either:

- (a) Add the `key={prevImage!.id}` / `key={nextImage!.id}` props back —
  but that destroys the `<img>` element's decoded bitmap on every nav, so
  every side panel must re-decode from cache (likely 30–60ms hit).
- (b) Delete the misleading comment and accept that the actual mechanism
  preventing stale textures is `removeAttribute("src")` in
  `commitStripReset` plus the COMMIT-time `data-thumb` swap.

I'd pick (b). The other mechanisms are doing the job. Update the comment
to reflect reality.

### 2.4 `commitStripReset` does three orthogonal things at once

```ts
// 1. Copy target's bitmap to center (visual continuity)
centerImg.src = targetImg.src;
centerImg.setAttribute("data-committed", "");
centerImg.style.transform = "";   // 2. Reset zoom
centerImg.style.willChange = "";
centerImg.style.transition = "";
// 3. Clear side panels (kill stale textures)
for (panel of others) img.removeAttribute("src");
// 4. Reset strip transform
strip.style.transition = "none";
strip.style.transform = "";
```

This function is the busiest 30 lines in the carousel and the one that
gets blamed first when something breaks. Concretely:

- The pinch-zoom reset (2) is unrelated to the duplicate-image fix and
  arguably belongs in the `useLayoutEffect` on `imageId` change (which
  already does this for `imageRef.current`). Doing it twice is harmless
  but the duplication will confuse the next agent.
- The side-panel clearing (3) is the most subtle bit. It works only
  because (a) the panels are off-screen at this moment, and (b) React's
  next render writes fresh URLs before the next swipe lands its
  animation. If the user starts a new swipe before React commits, the
  side panel has *no* src — blank slide-in. The data-thumb fallback at
  COMMIT catches that, but the chain of dependencies isn't obvious.

Suggest: extract `clearSidePanels(strip, centerPanel)` and
`copyTargetToCenter(strip, direction)` as named helpers in the same file.
No behavioural change, but the code documents itself.

### 2.5 The data-thumb fallback can write a not-yet-cached thumbnail

`useSwipeCarousel.ts:255-258`:

```ts
if (!complete && thumb) img.src = thumb;
```

If the thumbnail prefetch hasn't completed (very early swipes, slow
network, or large gaps in the buffer), this assignment kicks off a fresh
HTTP request. The animation starts immediately after — so you've replaced
"slide in undecoded full-res" with "slide in undecoded thumbnail" with
no improvement.

In practice, thumbnails are 5–20KB JPEGs, decode in <10ms, and the
prefetch is mobile-only — so the window where they aren't ready is
narrow. But it exists, and there's no log of how often the fallback fires
without a cached thumbnail. Worth a single check:

```ts
if (!complete && thumb) {
  const probe = new Image();
  probe.src = thumb;
  if (probe.complete) img.src = thumb;
  // else: leave the full-res, it's no worse than the thumbnail
}
```

(`probe.complete === true` synchronously when the resource is in the
memory cache. Not 100% reliable on Chrome Android, as you discovered, but
better than blindly swapping.)

Optional. Low priority.

### 2.6 Prefetch URL vs panel URL — same shape today, fragile tomorrow

`image-prefetch.ts:103-109` builds `prefetchUrl(image)` with
`screenOpts = {width: screen.width, height: screen.height, ...}`.
`ImageDetail.tsx:436-441, 453-458` builds the side-panel URL with
`{width: window.screen.width, height: window.screen.height, ...}`.

These produce identical strings today. They will diverge the moment
someone touches either site without touching the other (e.g. someone adds
a `quality:` param to the panel for sharpness; prefetch doesn't get it;
prefetch warms the wrong URL; `isFullResLoaded` lies; cascade returns).

Suggest: extract `getCarouselImageUrl(image)` returning the canonical URL,
and use it from both prefetch and panel. One source of truth.

### 2.7 Listener pattern triggers re-render per decode

`onFullResDecoded` fires `setPrefetchGen(g => g + 1)` for *every* decode
of the current prev/next images. In bursts (e.g. 5 prefetched images
finishing within 50ms), this is up to 2 setState calls (only prev/next
match). Cheap, but the listener Set is global — if you ever mount two
ImageDetail components in the same page, both subscribe.

Not a bug today (only one ImageDetail at a time). Note for future.

### 2.8 Minor

- `useSwipeCarousel.ts` declares `pendingCb`, `pendingDirection`,
  `pendingAnimation` as `let`s **after** `addEventListener` calls but in
  the same effect scope. Closures over them work because JS hoisting +
  the closures only fire after init. Confusing on first read. Move them
  above the listeners.
- `commitStripReset` finds panels by `panel.style.transform` string
  matching (`""` for center, `"translateX(100%)"` for target). If anyone
  ever sets transforms in JS or CSS that change the serialised form
  (e.g. `translate3d`, or appended trailing whitespace), this silently
  picks the wrong panel. Robust alternative: indexed access (panels
  always rendered in [prev?, center, next?] order) or `data-panel`
  attribute.
- WAAPI uses `fill: "forwards"` then `anim.cancel()` after reset. With
  `fill: "none"` and pre-setting the strip to `translateX(target)` before
  `commitStripReset`, you skip the cancel — but the cancel is essentially
  free, so this is purely cosmetic.
- `useEffect` cleanup in `useSwipeCarousel` cancels the pending
  animation. If the user navigates away mid-swipe, the navigate callback
  in the `.then()` chain is *not* cancelled — but `animation.cancel()`
  causes `.finished` to reject, hitting the empty `.catch()`. So the
  callback is silently dropped. Probably what you want. Worth a comment.

---

## 3. Performance — the "decoded twice" question

### What's actually happening

For each navigation forward to image B (assuming B was prefetched):

1. **Prefetch (already happened earlier):** `new Image(); img.src = url; img.decode()` →
   1× HTTP fetch + 1× AVIF decode held in the prefetch Image object.
2. **Side panel arrival:** when B becomes the next-panel target, the
   StableImg element creates a `<img>` with the same URL → Chrome's HTTP
   cache hit (no network) but **fresh AVIF decode** in the DOM element's
   bitmap slot.
3. **Center panel after swipe:** `commitStripReset` copies the *target
   img.src* into the center img → on most browsers, assigning the same
   src URL is a no-op for the bitmap (Chrome reuses it). So no extra
   decode here. But:
4. **StableImg's useLayoutEffect runs after navigation.** The current
   image's `imageUrl` (computed in ImageDetail) might differ from what
   `commitStripReset` wrote (different imgproxy size params if the side
   panel was using thumbnail). If different, StableImg writes the new
   URL → **another decode.**

So worst case (rapid swipe, side panel was thumbnail): 1 prefetch decode
+ 1 thumbnail decode (used for animation) + 1 full-res decode in center
after landing = **3 decodes per navigation.** Best case (slow swipe, side
panel was full-res via prefetch): 1 prefetch decode + 1 panel decode = 2.

Why doesn't Chrome share decoded bitmaps between an `Image()` object and
a DOM `<img>`? Because each `HTMLImageElement` owns its bitmap slot
independently. The HTTP cache is shared; the decoded-bitmap cache is
per-element. This is documented blink behaviour and you can't change it.

### Things that would actually reduce decode count

In rough order of effort vs payoff:

#### A. `<link rel="preload" as="image">` instead of `new Image()`

Browsers' resource preloader is integration-aware: a preloaded image is
sometimes promoted to the same bitmap slot when a later `<img>` with the
matching URL appears. Behaviour varies by browser version — not a
guarantee — but it's strictly better than `new Image()` for warming the
cache and may halve decode count on Chrome.

Cheap to try: replace the prefetch `new Image()` with a `<link>` element
appended to `<head>`. Keep the `decode()` machinery for the
`isFullResLoaded` signal. ~10 lines.

#### B. `createImageBitmap()` + canvas

If you really want to eliminate the duplicate decode, decode once into an
`ImageBitmap` (held alive in your Map) and paint via a `<canvas>`
element. The browser does not re-decode from the ImageBitmap — it just
blits the pixels. Trade-offs:

- Replaces `<img>` with `<canvas>` in the carousel. Lots of incidental
  changes (object-fit, sizing, `alt`, etc.).
- Pinch-zoom on canvas works (CSS transform applies the same way).
- `ImageBitmap` lifetime is yours to manage. Forget to `.close()` and
  you leak GPU memory.
- Real engineering effort. Maybe 1–2 days.

This is the *only* way to truly eliminate the second decode. Whether
it's worth it depends on whether you can measure decode time as a real
user-visible problem.

> **Earlier draft suggested switching mobile to WebP for faster decode.
> Withdrawn.** Your benchmarks (`image-optimisation-research.md`, AVIF
> q63/s8 + DPR 1.5× section) measured AVIF decode max gaps as
> equal-or-better than WebP at every traversal tier on Chromium 145, with
> AVIF files 9–15% smaller. The "AVIF decode is 2–4× slower" line is a
> generic claim that doesn't hold for this corpus / browser version.
> Don't change the format. The only residual caveat is that the
> measurements are desktop, and decode parity may not hold on low-end ARM
> phones — but the data-thumb fallback already absorbs that worst case.
> `IMGPROXY_PREFERRED_FORMATS` content negotiation is the escape hatch
> if it ever becomes an issue.

#### C. Don't decode unused thumbnails

`isTouchDevice` ensures thumbnails aren't prefetched on desktop — good.
But on mobile, you fire 5 thumbnail prefetches per navigation (4 ahead +
1 behind). You only ever need thumbnails for **the immediate prev/next**
because the data-thumb fallback only reads from those two panels. The
other 3 are dead weight.

Restrict thumbnail prefetch to `i±1`. Saves ~3 HTTP requests + decodes
per navigation on mobile.

#### D. Stop double-painting on the center panel after `commitStripReset`

Today: target src is copied to center, then on the next React render,
StableImg may write `imageUrl` (a *differently-constructed* URL for the
same image, e.g. the side panel was using thumbnail). That triggers a
second decode.

You could canonicalise the center URL at commit time too — write
`imageUrl` (the about-to-arrive URL) instead of `targetImg.src` (the
panel's pre-commit URL). Requires passing `nextImage`/`prevImage` URLs
into the hook. ~15 lines. Eliminates the most common cause of "rapid
swipe lands, full-res reloads, brief blur".

---

## 4. Architecture concerns (longer-term)

### 4.1 The whole carousel is built around a constraint that may not need to exist

You're maintaining a 3-panel strip + animation + 4 layered fixes to make
horizontal swipes look smooth. Immich (per your worklog research) has
**one image element**, swipe = navigate, no slide animation. They
serialise navigation through `InvocationTracker`. Bug class: doesn't
exist for them.

The worklog is honest about this: *"No carousel = no duplicate-image
bug."* You chose the harder path because the slide animation is part of
your UX. That's a legitimate product decision. But if at some point you
get tired of the maintenance burden, "drop the slide animation" is on
the table and removes the entire problem space.

### 4.2 Coupling between hooks is now load-bearing

`scaleRef` is created in `ImageDetail` and passed to three hooks
(`useSwipeCarousel`, `usePinchZoom`, `useSwipeDismiss`). `lastSwipeTimeRef`
similarly. The component is the integration point. Any hook can now
silently affect the others by mutating these refs.

This is fine — the alternative (each hook owning its state, exposing
events, parent wiring them) is more code. But document the contract on
the refs in one place. Today you'd have to read three hooks to figure
out what `scaleRef > 1` means.

### 4.3 `StableImg` is imperative React-bypass, justified but suspect

`StableImg` exists to opt out of React's reconciliation for a single
attribute. That's a real escape hatch and you needed it. But it's also
the kind of component a reviewer (or future you) will look at and want
to delete. Make sure the doc comment stays current and explains *which
specific browser/React interaction* it works around. Right now the
comment is excellent — keep it that way.

A future React version that adds proper "if value unchanged, skip DOM
write for this attribute" semantics would let you delete StableImg.
Worth checking React 19+ release notes periodically — I don't believe
they have it yet.

---

## 5. Quick-win checklist (in priority order)

- [x] Strip diagnostics (`swipe-diag.ts`, `SwipeDiagButton.tsx`, all
      `diagLog/diagPanelSrcs/diagStartFrameTracker` call sites). Or gate
      behind a build-time flag.
- [x] Replace `_loadedFullRes: Map<string, HTMLImageElement>` with
      `Set<string>`. Update the doc comment. Remove `markFullResLoaded`'s
      dummy `new Image()`.
- [x] Delete or correct the "keyed panels" comment at the top of
      `useSwipeCarousel.ts`.
- [x] Restrict thumbnail prefetch to `i±1` (drop `i±2..4`).
- [x] Extract `getCarouselImageUrl(image)` shared by prefetch + panel
      useMemos.
- [x] Move `pendingCb`/`pendingDirection`/`pendingAnimation` declarations
      above the listener registration in `useSwipeCarousel.ts`.

## 6. Bigger experiments (if you want more)

- [ ] Switch to `<link rel="preload" as="image">` for prefetch.
- [ ] Canonicalise the center src write at commit time using the
      about-to-arrive `imageUrl`, eliminating the second decode after
      rapid swipes.
- [ ] Investigate `createImageBitmap()` + `<canvas>` for true
      zero-duplicate-decode (only worth it if measurement shows decode
      latency is actually a UX problem).

---

## 7. Desktop traversal — separate review

> Added on request: the desktop path was not part of the original
> investigation, but it shares code with the mobile carousel and
> deserves its own look. Files re-read for this section:
> `ImageDetail.tsx` (NavStrip + carousel JSX, `useImageTraversal` hookup),
> `FullscreenPreview.tsx`, `useImageTraversal.ts`, `image-prefetch.ts`,
> `NavStrip.tsx`.

### 7.1 What the desktop path actually is

There are **two distinct desktop traversal flows**:

**A. ImageDetail (the route `/search?image=…`)** — opened by clicking a
grid/table row. This is where most desktop users live. Renders the full
metadata sidebar + image. Navigation via:
- `←` / `→` arrow keys
- Hover-revealed `NavStrip` chevrons at the left/right edges of the image area
- Click outside / "← Back" button to close

**B. FullscreenPreview (`f` key from grid/table)** — lightweight peek that
renders only the image. No metadata, no carousel strip, just a single
`<img src>` that swaps on navigation. Same `useImageTraversal` hook,
completely different render path.

These two flows differ more than they should, and that's the headline
finding of this section.

### 7.2 The desktop path through ImageDetail is paying for the mobile fix

This is the big one and it's straightforward:

**On desktop, the carousel strip with three panels (`prev | center |
next`) is rendered, the off-screen prev and next `<img>` elements have
`src` attributes set, and the browser fetches and decodes both side
panels — even though the swipe animation never fires on desktop and
the user never sees them.**

Walk through what happens when a desktop user presses `→`:

1. `goToNext()` → URL changes → React re-renders.
2. New `prevImage` and `nextImage` resolve from the buffer.
3. `prevImageUrl` / `nextImageUrl` useMemos compute (full-res when
   `isFullResLoaded`, thumbnail otherwise — but on desktop, thumbnails
   aren't prefetched, so on a cold prev/next they fall back to a fresh
   thumbnail request).
4. The two off-screen `<StableImg>` panels render. StableImg's
   `useLayoutEffect` writes their `src`. Browser fetches + decodes both.
5. Center `<StableImg>` writes the new `imageUrl`. Browser fetches +
   decodes the visible image.

Per navigation on desktop you are doing **3 image fetches and 3 AVIF
decodes when only 1 is visible.** At DPR 1.5× and ~1MB AVIF per image,
that's ~2MB of wasted network and ~200–300ms of wasted decode CPU per
arrow press, on every nav, indefinitely.

Held-arrow-key power user case: 30 events/sec × 2 wasted decodes = the
decoder is spending most of its time on pixels that will never be shown,
while the actual visible image waits its turn.

`FullscreenPreview` doesn't have this problem at all. It renders one
`<img>`, swaps `src`, done.

#### Fix

Gate the side-panel divs behind a coarse-pointer check. The cleanest
pattern (you already use `_pointerCoarse` from `useUiPrefsStore` in
ImageDetail):

```tsx
{_pointerCoarse && prevImageUrl && (
  <div ... style={{ transform: "translateX(-100%)" }}>
    <StableImg src={prevImageUrl} ... />
  </div>
)}
{/* center panel: always rendered */}
{_pointerCoarse && nextImageUrl && (
  <div ... style={{ transform: "translateX(100%)" }}>
    <StableImg src={nextImageUrl} ... />
  </div>
)}
```

`stripRef` and the `useSwipeCarousel` hook can stay (the hook attaches
listeners to `containerRef`; on desktop the touch events never fire, so
it costs nothing). The hook already has no-op semantics on desktop —
this just stops paying the rendering cost for content nobody sees.

Likely impact:
- Bandwidth: down ~66% on every navigation (3 → 1 image fetch per nav)
- Decode CPU: down ~66% (3 → 1 decode per nav)
- Held-arrow-key smoothness: noticeable improvement (the decoder no
  longer competes with itself)
- Risk: zero — desktop doesn't currently use these panels for anything
  visual

### 7.3 `img.decode()` in prefetch is desktop-pure-waste

`prefetchNearbyImages` calls `img.decode()` on every prefetched image
and stores the resolved Image in `_loadedFullRes`. The point of this
machinery is to support the side-panel "use full-res when prefetch is
ready" choice — which only happens on mobile.

On desktop, the decoded bitmap is never reused (DOM `<img>` does its
own decode, as you discovered). The prefetch is doing useful HTTP-cache
warming and useless decoding.

5 prefetches per nav × ~80–150ms decode each = **400–750ms of CPU per
navigation that nobody benefits from on desktop.** On a fast i9 it
disappears in the noise. On older Intel laptops it's measurable.

#### Fix

Two options:

**Cheap:** branch on `isTouchDevice` in `prefetchNearbyImages`. On
desktop, do `new Image(); img.src = url` and skip `.decode()`. The
HTTP cache still warms; the bitmap doesn't decode until the DOM
element actually needs it. ~5 lines.

**Cleaner:** switch desktop to `<link rel="preload" as="image" href={url}>`
appended to `<head>`. This is the browser's native "I want this image
soon" primitive — it gets connection priority and (sometimes, in
Chrome) bitmap-slot hand-off to a subsequent `<img>`. ~15 lines, must
remove on unmount, but it's the textbook answer.

Either way, `_loadedFullRes` and `onFullResDecoded` become mobile-only
codepaths. The `prefetchGen` state in ImageDetail can be removed when
side panels are gated to mobile (§7.2) — it triggers re-renders that
only affect side panels.

### 7.4 NavStrip hover is a wasted intent signal

When a desktop user hovers `NavStrip`, they are extremely likely to
click within ~150ms. That's a strong "the next/prev image is needed
NOW" signal.

Currently `onMouseEnter` only resets the cursor-auto-hide timer
(`navMouseEnter`). The actual prefetch state isn't touched.

A reasonable enhancement: on `NavStrip` hover, schedule a one-shot
high-priority decode of the corresponding image. Something like:

```ts
function handleNavStripHover(image: Image) {
  navMouseEnter();
  if (!image) return;
  const url = getCarouselImageUrl(image);
  if (!url) return;
  // Bypass the throttle gate — this is an intent signal, not a batch
  const img = new Image();
  img.fetchPriority = "high";
  img.src = url;
  img.decode().catch(() => {});
}
```

Probably not worth doing **unless** measurement shows held-mouse-hover →
click latency is currently visible. The 4-ahead prefetch should already
have it warm in normal browsing. But hover-prefetch is one of those
"costs ~10 lines, never makes anything worse" optimisations that's
worth holding in your back pocket.

### 7.5 Other smaller things

- **`will-change: transform` on the strip is set unconditionally.** On
  desktop the strip never animates. The promoted layer is GPU memory
  spent for nothing. `sm:will-change-transform` (Tailwind) or only set
  it when `_pointerCoarse`. Trivial.
- **The `prefetchGen` re-render churn.** `onFullResDecoded` listener
  bumps `prefetchGen` whenever the prev/next image's prefetch finishes
  decoding. On desktop, since side panels are useless and decoded
  bitmaps don't help either way, this state and its listener
  registration are pure overhead. Falls out for free if §7.2 + §7.3
  are done.
- **StableImg's URL-canonicalisation is overhead with no payoff on
  desktop.** `commitStripReset` never runs, `data-committed` is never
  set, and on every navigation the URLs really do differ. Microseconds,
  but it's complexity that exists purely to support mobile. If you
  ever wanted to: render `<img src={imageUrl}>` directly on desktop
  and `<StableImg>` only on coarse-pointer. Probably not worth the
  branching cost.
- **Held-arrow-key flash.** On rapid arrow presses, the desktop user
  sees the old image for ~30–80ms (browser holds the previous bitmap
  as compositor texture until the new one decodes). This is the same
  underlying mechanism as the mobile duplicate-image bug, but on
  desktop it manifests as a brief "snappy delay" rather than a visual
  duplicate, because there's no animation expecting alignment with
  the new content. Not a bug, but it's why the user perception of
  desktop traversal speed is dominated by AVIF decode time. The fixes
  in §7.2 / §7.3 free up decode bandwidth and will help here.
- **No equivalent of "decode gate" on desktop is needed or wanted.**
  The mobile decode gate was rejected because it blocked swipes for
  300–500ms. Desktop already shows the previous image visually until
  the new one paints — that's effectively a free "decode gate" with
  no UX cost.

### 7.6 What you'd skip applying from mobile

For completeness — these mobile mechanisms **should not** be ported to
desktop:

| Mobile mechanism | Skip on desktop because… |
|---|---|
| `data-thumb` fallback at COMMIT | No animation to swap during |
| Side-panel `removeAttribute("src")` | No side panels needed |
| `commitStripReset` imperative copy | No swipe → no commit |
| `StableImg` `data-committed` flag | Never set on desktop |
| Thumbnail prefetch | Already correctly skipped (`isTouchDevice`) |
| `img.decode()` in prefetch | See §7.3 — actively harmful on desktop |

### 7.7 Verdict

Desktop traversal **works correctly** today — there is no analogous
"duplicate image" bug, no broken state, nothing to apologise for. But
it carries a substantial amount of mobile-specific machinery as dead
weight, and there are two changes (§7.2 gating side panels, §7.3
dropping `img.decode()` in prefetch) that should produce noticeable
held-arrow-key smoothness improvements with minimal code change and
zero regression risk on the working desktop UX.

`FullscreenPreview` is the proof: the simplest possible implementation
(one `<img>`, swap `src`) already feels great on desktop. ImageDetail's
desktop path can move closer to that simplicity without losing
anything.

#### Desktop quick-win checklist

- [x] Gate side-panel `<StableImg>` rendering on `_pointerCoarse`.
- [x] Skip `img.decode()` in prefetch on desktop (or migrate desktop
      prefetch to `<link rel="preload" as="image">`).
- [ ] (Optional) Drop the `prefetchGen` state from ImageDetail once
      side panels are gated — it's only used to upgrade them.
- [x] (Optional) Make `will-change: transform` mobile-only.
- [ ] (Optional) Hover-prefetch on `NavStrip` — measure first.

---

## 8. What you got right (because the doc shouldn't be all bile)

- The investigation discipline — diagnostic v2 with ✓/⏳ markers, the
  log-buffer-to-clipboard button, stash-testing the unrelated bug fixes
  to prove they were innocent — is exactly how this kind of bug should
  be hunted. Many seasoned engineers would have flailed harder.
- WAAPI was the right call even though it didn't fix the bug. Microtask
  resolution + explicit cancel semantics are strictly better than
  `transitionend` for this use case.
- Choosing "blank > wrong" for the side panel `removeAttribute("src")`
  is the right product instinct. Most people would have shipped with
  the duplicates.
- The `StableImg` escape hatch is *correctly* scoped — it doesn't try to
  manage anything except the one prop it needs to manage. Good
  discipline.
- Data-thumb fallback at COMMIT, not earlier or later, is the right
  insertion point. It exploits the one moment when you know exactly
  which panel is about to be visible AND have time to swap before
  WAAPI starts.

The fix is good. The cleanup that should follow it is the easy part.
