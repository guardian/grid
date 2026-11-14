/**
 * Image detail view — overlay within the search route.
 *
 * This is NOT a separate page. It renders on top of the search results when
 * `image` is present in the URL search params. The search page stays
 * mounted underneath (hidden via CSS), so:
 * - Scroll position is preserved exactly
 * - Search context (query, filters, sort) is preserved in the URL
 * - Browser back removes `image` from params → table reappears at the
 *   exact scroll position
 * - No re-search is triggered (image is a display-only URL param)
 *
 * Architecture (Decision 5): "all views are one page — table, grid,
 * side-by-side, detail are density levels of the same ordered list."
 *
 * Key architectural property:
 * - **Fullscreen survives between images.** The fullscreened container is a
 *   stable DOM element. When the imageId prop changes (prev/next), React
 *   reconciles the same component — the DOM node persists, so the Fullscreen
 *   API does not exit.
 * - Keyboard shortcuts: `f` toggle fullscreen (`Alt+f` in text fields),
 *   `←/→` prev/next image,
 *   `Escape` exit fullscreen only (never navigates — close via the
 *   "← Back" button in the UI).
 * - "← Back" button calls `history.back()` to pop the detail entry.
 *   Forward then re-opens the detail. All four close affordances (back
 *   button, double-click, Backspace, swipe-to-dismiss) share the same
 *   `closeDetail` callback which calls `markUserInitiatedNavigation()`
 *   then `history.back()`.
 * - On mount, a bare-list entry is always synthesised below the detail
 *   so that `history.back()` lands on a kupua search page (not the
 *   referring site or a blank tab). This costs one extra browser-back
 *   to leave kupua, but guarantees the in-app "Back to search" button
 *   always works — regardless of how the user arrived.
 *   Exception: when entered via SPA navigation (pushNavigate from
 *   grid/table), synthesis is skipped because the list entry already
 *   exists in history.
 * - Prev/next navigates through the search results stored in the Zustand
 *   search store, replacing `imageId` in the URL with `replace: true`
 *   (so back always returns to the table, not through every viewed image).
 */

import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useBrowsingContext, useBrowsingSearch } from "@/lib/browsing-context";
import { captureBrowsingDeparture } from "@/lib/browsing-navigation";
import { getSearchGeneration, useSearchStore } from "@/stores/search-store";
import { useDataWindow } from "@/hooks/useDataWindow";
import { useImageTraversal } from "@/hooks/useImageTraversal";
import { useFullscreen } from "@/hooks/useFullscreen";
import { useCursorAutoHide } from "@/hooks/useCursorAutoHide";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";
import { useSwipeCarousel } from "@/hooks/useSwipeCarousel";
import { useSwipeDismiss } from "@/hooks/useSwipeDismiss";
import { captureDetailEntry, chooseDetailReturn } from "@/lib/detail-return";
import { usePinchZoom } from "@/hooks/usePinchZoom";
import { getFullImageUrl, getThumbnailUrl, getZoomImageUrl } from "@/lib/image-urls";
import { isFullResLoaded, markFullResLoaded, onFullResDecoded, getCarouselImageUrl } from "@/lib/image-prefetch";
import { FullscreenCornerButton, NavStrip } from "@/components/NavStrip";
import { StableImg } from "@/components/StableImg";
import { resetToHome } from "@/lib/reset-to-home";
import { scrollFocusedIntoView, markUserInitiatedNavigation, pushNavigate, pushNavigateAsPopstate, consumeDetailEnteredViaSpaFlag } from "@/lib/orchestration/search";
import { withCurrentKupuaKey, mintKupuaKey } from "@/lib/orchestration/history-key";
import { DEFAULT_SEARCH } from "@/lib/home-defaults";
import { storeImageOffset, getImageOffset, buildSearchKey, extractSortValues } from "@/lib/image-offset-cache";
import { ImageMetadata } from "@/components/ImageMetadata";
import { ImageCrops, MobileImageCrops, cropAsset, latestCrops } from "@/components/ImageCrops";
import { useCropSettings } from "@/hooks/useCropSettings";
import { allowsCropRatio } from "@/lib/crop/crop-options";
import { cropAccess } from "@/lib/crop/crop-policy";
import { UsagesSection, countDisplayUsages } from "@/components/UsagesSection";
import { AccordionSection, useIsCompact } from "@/components/PanelLayout";
import { BottomSheet } from "@/components/BottomSheet";
import { DetailNavigation } from "@/components/DetailNavigation";
import { SettingsMenu } from "@/components/SettingsMenu";
import { imageFullscreenElement } from "@/lib/app-fullscreen";
import { getEffectiveFocusMode } from "@/stores/ui-prefs-store";
import { useTouchCapable } from "@/hooks/useShell";
import { consumeTraceInteraction, traceInteraction } from "@/lib/perceived-trace";
import type { Image } from "@/types/image";
import type { EnrichmentFields } from "@/stores/enrichment-store";
import { acceptEnrichedImage, attachedEnrichment, attachEnrichment } from "@/stores/enrichment-store";
import { captureImageRead, ensureImageRead, hasImageFence, protectsImageOmission, withholdImageAuthority } from "@/lib/image-read-freshness";
import { ownStandalonePublication } from "@/lib/image-publication";
import { getImageAvailability, unavailableImage } from "@/lib/image-read-freshness";
import { useSelectionStore } from "@/stores/selection-store";
import { useEnrichedImage } from "@/hooks/useEnrichedImage";
import { ImageActions, FullFrameOptions } from "./ImageActions";
import { ImageActionFab } from "./SelectionFab";
import { imageHasFullFrame, type ImageActionContext } from "@/lib/image-actions";
import { isGridSessionInvalidated, subscribeGridSessionInvalidation } from "@/lib/grid-api-instance";

const CropEditor = lazy(() => import("@/components/crop/CropEditor").then((m) => ({ default: m.CropEditor })));

/** Delay before acting on single-tap in fullscreen — allows double-tap-to-zoom. */
const DOUBLE_TAP_MS = 300;

interface ImageDetailProps {
  imageId: string;
  /** Ref to the grid/list container behind the detail — animated during dismiss. */
  gridContainerRef?: React.RefObject<HTMLElement | null>;
}

export function ImageDetail({ imageId, gridContainerRef }: ImageDetailProps) {
  const { total, findImageIndex, getImage } = useDataWindow();
  const dataSource = useSearchStore((s) => s.dataSource);
  const restoreAroundCursor = useSearchStore((s) => s.restoreAroundCursor);
  const navigate = useNavigate();
  const router = useRouter();
  const searchParams = useBrowsingSearch();
  const { path } = useBrowsingContext();
  const cropping = searchParams.cropping === "true";
  const searchKey = useMemo(() => buildSearchKey(searchParams), [searchParams]);

  // Mount timestamp — used to suppress stray dblclick events that leak
  // from the grid/table in phantom focus mode. In phantom mode, single-click
  // opens detail; if the user double-clicks, React re-renders fast enough
  // that the second click lands on ImageDetail's <img>, and the browser
  // synthesises a dblclick → closeDetail. Suppressing dblclick for 500ms
  // after mount blocks this without affecting legitimate double-click-to-close.
  const mountTimeRef = useRef(Date.now());

  // The fullscreen container ref — must be stable across imageId changes
  const containerRef = useRef<HTMLDivElement>(null);
  const cancelSwipeRef = useRef<(() => void) | undefined>(undefined);

  // ── Deep-link synthesis ────────────────────────────────────────────
  //
  // If the user landed directly on ?image=X (paste, bookmark, reload),
  // synthesise a bare-list entry below the detail so closeDetail's
  // history.back() has somewhere to go. Without this, history.back()
  // would exit kupua (or the tab).
  //
  // Skip synthesis after SPA entry or when the entry already records
  // `_bareListSynthesized`, otherwise every open-detail would insert a
  // phantom bare-list entry, doubling the back-presses needed.
  //
  // Both replaceState + pushState fire in the same synchronous tick;
  // Chrome and Firefox coalesce, so no rendered or URL-bar flicker.
  //
  // Result: stack goes from [...prior] [detail@A] to [...prior] [bare-list] [detail@A].
  const hasSynthesizedRef = useRef(false);
  const enteredViaSpaRef = useRef(false);
  useLayoutEffect(() => {
    if (hasSynthesizedRef.current) return;
    hasSynthesizedRef.current = true;

    if (consumeDetailEnteredViaSpaFlag()) {
      enteredViaSpaRef.current = true;
      if (!history.state?._bareListSynthesized || !history.state?._detailEntryImageId) {
        history.replaceState({
          ...history.state,
          _bareListSynthesized: true,
          _detailEntryImageId: history.state?._detailEntryImageId ?? imageId,
        }, "");
      }
      return;
    }

    if (history.state?._bareListSynthesized) {
      if (!history.state?._detailEntryImageId) {
        history.replaceState({
          ...history.state,
          _detailEntryImageId: imageId,
        }, "");
      }
      return;
    }

    // Save the current state and URL before replacing
    const detailState = {
      ...history.state,
      _detailEntryImageId: history.state?._detailEntryImageId ?? imageId,
    };
    const detailUrl = window.location.href;

    // Build the bare-list URL (current URL minus ?image=...)
    const url = new URL(detailUrl);
    url.searchParams.delete("image");
    url.searchParams.delete("crop");
    url.searchParams.delete("cropping");
    const bareListUrl = url.pathname + url.search;

    // Step 1: replace current entry with bare-list. Mint a fresh kupuaKey
    // so this synthesised entry can participate in the snapshot system.
    const originKey = mintKupuaKey();
    history.replaceState({ kupuaKey: originKey }, "", bareListUrl);
    // Step 2: push the detail URL back with the original TSR state intact
    // (including its kupuaKey, if any). Stamp it so re-mounts skip.
    history.pushState({ ...detailState, _bareListSynthesized: true, _detailOriginKupuaKey: originKey }, "", detailUrl);
  }, []);

  // Wrapper around the entire detail view — animated during swipe-to-dismiss.
  const detailWrapperRef = useRef<HTMLDivElement>(null);
  const mobileFullscreenRequestedRef = useRef(false);
  // Carousel strip — the inner element translated by swipe gestures.
  const stripRef = useRef<HTMLDivElement>(null);
  const imageSurfaceRef = useRef<HTMLDivElement>(null);
  // Center panel's <img> — transform target for pinch-zoom.
  const imageRef = useRef<HTMLImageElement>(null);

  // Tracks the imageId we have already emitted open-detail t_store_ready for.
  // Must be declared at top level (before any early returns) to satisfy
  // the rules of hooks. Paired effect lives further down once `image` is
  // available; the ref itself is harmless to declare here.
  const openDetailSettledRef = useRef<string | null>(null);
  const openDetailInteractionRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const interactionId = consumeTraceInteraction("open-detail");
    if (interactionId) openDetailInteractionRef.current = interactionId;
  }, []);
  // Mobile scroll container — the outer flex-col div that scrolls on narrow screens.
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  const isCompact = useIsCompact();
  const { settings: cropSettings } = useCropSettings();
  const [cardExpanded, setCardExpanded] = useState(false);
  const [actionsCloseSignal, setActionsCloseSignal] = useState(0);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const { isFullscreen, toggleFullscreen } = useFullscreen(containerRef);
  const { cursorHidden, navMouseEnter, navMouseLeave, touchControlsVisible } = useCursorAutoHide(isFullscreen, isCompact ? undefined : containerRef);

  // Find the current image in search results (handles sparse array).
  // NOT memoized: findImageIndex is stable ([] deps, reads getState()
  // imperatively), so a useMemo on [findImageIndex, imageId] would never
  // recompute when the buffer changes — causing a stale index after
  // popstate-triggered search() replaces the results array.
  // This is O(1) (Map.get) and ImageDetail renders for one image, so
  // computing on every render is negligible.
  const currentIndex = findImageIndex(imageId);
  const imageFromResults = currentIndex >= 0 ? getImage(currentIndex) : undefined;

  // ── Restore search context from cached cursor ──────────────────────
  //
  // On page reload, the image may not be in the first page of results.
  // If we have a cached cursor (stored when entering image detail or
  // navigating prev/next), use search_after to load a page centered on
  // the image. With a cursor this is exact at any depth. Without one
  // (old cache format) falls back to approximate seek.
  // Track which imageId the restore was attempted for — guards against
  // re-triggering restore for the same image when the buffer briefly
  // contains it then loses it (e.g. scroll-seek in two-tier mode).
  const restoreAttemptedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (currentIndex >= 0) {
      // Image visible in buffer — mark as handled. Prevents a spurious
      // re-restore if the image later falls out due to a background
      // scroll-seek in two-tier mode. Without this, navigating to an
      // adjacent image during an in-flight restore resets the flag, and
      // a subsequent buffer shift triggers a wasteful second
      // restoreAroundCursor call with a potentially-stale cursor.
      // (Audit bug #7)
      restoreAttemptedForRef.current = imageId;
      return;
    }
    // Don't attempt restore until the initial search has returned —
    // restoreAroundCursor needs total > 0 for countBefore to clamp correctly.
    if (total === 0) return;
    if (restoreAttemptedForRef.current === imageId) return; // already tried
    const cached = getImageOffset(imageId, searchKey);
    if (cached == null) return; // no cached position — standalone mode
    restoreAttemptedForRef.current = imageId;
    const pending = useSearchStore.getState()._cursorRestore;
    if (pending?.imageId === imageId && pending.generation === getSearchGeneration() && !pending.signal.aborted) return;
    restoreAroundCursor(imageId, cached.cursor, cached.offset, getEffectiveFocusMode() !== "phantom");
  }, [imageId, currentIndex, restoreAroundCursor, searchKey, total]);

  // Standalone fetch — when the imageId isn't in the search results
  // (e.g. direct URL navigation, bookmark, /images/:id redirect),
  // fetch it by ID from ES directly.  This eliminates the "Image not
  // found" dead end — if the image exists in the index, we show it.
  const [standalone, setStandalone] = useState<{
    imageId: string;
    image: Image | null;
    enrichment?: EnrichmentFields;
    failed: boolean;
    unresolved?: boolean;
    readFailed?: boolean;
  } | null>(null);
  const standaloneImage = standalone?.imageId === imageId ? standalone.image : null;
  const standaloneEnrichment = standalone?.imageId === imageId ? standalone.enrichment : undefined;
  const standaloneFetchFailed = standalone?.imageId === imageId && standalone.failed;
  const standaloneFailureText = standalone?.imageId === imageId && standalone.readFailed ? "Image could not be loaded" : "Image unavailable";

  useEffect(() => {
    // If the image is already in search results, no need to fetch
    if (imageFromResults) {
      setStandalone(null);
      return;
    }
    if (getImageAvailability(imageId) === "deleted") {
      setStandalone({ imageId, image: unavailableImage(imageId, "deleted"), failed: false });
      return;
    }
    // Fetch by ID
    let cancelled = false;
    const request = new AbortController();
    let current: Image | undefined;
    const publish = (image: Image) => {
      if (cancelled) return;
      current = image;
      setStandalone({ imageId, image, enrichment: attachedEnrichment(image), failed: false });
    };
    const releaseOwner = ownStandalonePublication({
      imageId,
      isCurrent: () => !cancelled,
      read: async signal => {
        const issued = captureImageRead();
        const found = await dataSource.getById(imageId, AbortSignal.any([signal, request.signal]));
        if (found) {
          ensureImageRead(found.image, issued, "full", found.enrichment);
          if (found.enrichment) attachEnrichment(found.image, found.enrichment);
        }
        return found?.image;
      },
      publish,
      publishUnavailable: availability => publish(unavailableImage(imageId, availability, current)),
      unavailable: () => {
        if (cancelled) return;
        withholdImageAuthority(imageId);
        setStandalone(previous => previous?.imageId === imageId
          ? { ...previous, enrichment: { resource: { links: [] }, actions: [] } } : previous);
      },
    });
    setStandalone({ imageId, image: null, failed: false });
    const issued = captureImageRead();
    const settleAbsence = (readFailed: boolean) => {
      if (cancelled) return;
      const availability = getImageAvailability(imageId);
      if (availability) publish(unavailableImage(imageId, availability, current));
      else if (!current || !protectsImageOmission(imageId, issued)) setStandalone({ imageId, image: null, failed: true, readFailed });
    };
    dataSource.getById(imageId, request.signal).then(
      (found) => {
        if (cancelled) return;
        if (found) {
          ensureImageRead(found.image, issued, "full", found.enrichment);
          if (found.enrichment) attachEnrichment(found.image, found.enrichment);
          const accepted = hasImageFence(imageId)
            ? acceptEnrichedImage(found.image, current ?? useSelectionStore.getState().metadataCache.get(imageId)) : found.image;
          if (accepted && (accepted === found.image || current || accepted.__availability)) publish(accepted);
          else setStandalone({ imageId, image: null, enrichment: undefined, failed: true, unresolved: true });
        } else settleAbsence(false);
      },
      () => settleAbsence(true),
    );
    return () => {
      cancelled = true;
      request.abort();
      current = undefined;
      releaseOwner();
    };
  }, [imageId, imageFromResults, dataSource]);

  // Use the image from results if available (preserves prev/next nav),
  // otherwise fall back to the standalone fetch
  const resolvedImage = imageFromResults ?? standaloneImage;
  const availability = resolvedImage?.__availability;
  const image = availability ? null : resolvedImage;
  const actionImage = useEnrichedImage(image ?? undefined, standaloneEnrichment);
  const sessionInvalidated = useSyncExternalStore(subscribeGridSessionInvalidation, isGridSessionInvalidated, () => false);
  const cropPolicy = cropAccess(actionImage, import.meta.env.VITE_USE_MEDIA_API === "true", sessionInvalidated);
  const selectedExport = useMemo(() => !cropping && cropPolicy.canReadExports && searchParams.crop
    ? latestCrops(image?.exports).find(crop => crop.id === searchParams.crop) : undefined,
  [cropping, cropPolicy.canReadExports, image?.exports, searchParams.crop]);
  const selectedCrop = selectedExport && allowsCropRatio(cropSettings, selectedExport.specification?.aspectRatio) ? selectedExport : undefined;
  const canCrop = Boolean(image && image.id === imageId && !cropPolicy.creationReason);
  const cropOwner = useRef({ imageId, canCrop });
  useLayoutEffect(() => {
    cropOwner.current = { imageId, canCrop };
    return () => { cropOwner.current = { imageId, canCrop: false }; };
  }, [imageId, canCrop]);

  // Emit open-detail store-ready the first time `image` is available for a
  // given imageId. Pairs with the owned interaction from ImageGrid.enterDetail. Declared up
  // here (before any early returns) to satisfy the rules of hooks.
  useEffect(() => {
    if (!image) return;
    if (openDetailSettledRef.current === image.id) return;
    openDetailSettledRef.current = image.id;
    requestAnimationFrame(() => {
      traceInteraction("open-detail", "t_store_ready", openDetailInteractionRef.current);
    });
  }, [image]);

  // ── Traversal via shared hook ──────────────────────────────────
  // The hook manages prev/next availability, buffer extension, seek,
  // and prefetch. It works identically in all three scroll modes.
  const searchParamsOrderBy = searchParams.orderBy;
  const onNavigate = useCallback(
    (img: Image, globalIndex: number) => {
      // Store the target image's offset + sort cursor in sessionStorage so
      // the counter and prev/next survive page reload.
      const cursor = extractSortValues(img, searchParamsOrderBy, searchKey);
      storeImageOffset(img.id, globalIndex, searchKey, cursor);

      // Raw navigate — not pushNavigate(). Traversal uses replace: true
      // (not a push), so the user-initiated flag is moot — the dedup guard
      // bails on display-only-key-only changes. If this ever becomes a push,
      // it must switch to pushNavigate().
      navigate({
        to: path,
        search: (prev: Record<string, unknown>) => ({ ...prev, image: img.id, crop: undefined }),
        replace: true,
        state: withCurrentKupuaKey(),
      });
    },
    [navigate, path, searchKey, searchParamsOrderBy],
  );

  const {
    prevImage, nextImage, canGoNext, goToPrev, goToNext, currentGlobalIndex,
  } = useImageTraversal(imageId, onNavigate, router.history, () => cancelSwipeRef.current?.());

  // Close image detail via history.back(). All four close affordances
  // (← Back button, double-click, Backspace, swipe-to-dismiss) share this
  // callback. Using history.back() instead of navigate({ replace: true })
  // means the detail entry stays in the forward stack — forward re-opens
  // the detail. Both close paths (explicit close and browser-back) now
  // produce identical stacks.
  //
  // markUserInitiatedNavigation() before history.back() ensures the
  // resulting popstate is treated as user-initiated by useUrlSearchSync,
  // preserving focus/position. In the common case (only the display-only
  // `image` key changed), the dedup guard bails before reading the flag,
  // but the marking is belt-and-braces safety for edge cases.
  const closeDetail = useCallback(() => {
    markUserInitiatedNavigation();
    history.back();
  }, []);

  useLayoutEffect(() => {
    const detail = detailWrapperRef.current;
    const fullscreenTarget = document.documentElement;
    const installed = window.matchMedia?.("(display-mode: standalone), (display-mode: fullscreen)").matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!isCompact || !enteredViaSpaRef.current || installed || !detail || !fullscreenTarget.requestFullscreen || document.fullscreenElement) return;

    let active = false;
    let exitTimer: ReturnType<typeof setTimeout> | undefined;
    const onFullscreenChange = () => {
      if (document.fullscreenElement === fullscreenTarget) {
        active = true;
        return;
      }
      if (!active) return;
      active = false;
      const entryKey = history.state?.kupuaKey;
      const exitUrl = window.location.href;
      exitTimer = setTimeout(() => {
        if (detail.isConnected && !document.fullscreenElement && history.state?.kupuaKey === entryKey && window.location.href === exitUrl) closeDetail();
      }, 100);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    if (!mobileFullscreenRequestedRef.current) {
      mobileFullscreenRequestedRef.current = true;
      void fullscreenTarget.requestFullscreen().then(() => {
        if (!detail.isConnected && document.fullscreenElement === fullscreenTarget) void document.exitFullscreen().catch(() => {});
      }).catch(() => {});
    }
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      if (exitTimer) clearTimeout(exitTimer);
      if (document.fullscreenElement === fullscreenTarget) void document.exitFullscreen().catch(() => {});
    };
  }, [closeDetail, isCompact]);

  // Crop editor: its own history entry (Kahuna's crop is a page), so Back leaves it.
  // A deep link (legacy /images/:id/crop) has no entry below to go back to.
  useEffect(() => {
    if (cropping && isFullscreen) void document.exitFullscreen().catch(() => {});
  }, [cropping, isFullscreen]);
  const openCrop = useCallback(() => {
    if (!canCrop || import.meta.env.VITE_USE_MEDIA_API === "true" && isGridSessionInvalidated()) return;
    const originLocation = window.location.href;
    const originKey = history.state?.kupuaKey;
    const enter = () => {
      if (!cropOwner.current.canCrop || cropOwner.current.imageId !== imageId || window.location.href !== originLocation
        || history.state?.kupuaKey !== originKey || import.meta.env.VITE_USE_MEDIA_API === "true" && isGridSessionInvalidated()) return;
      pushNavigate(navigate, {
        to: path,
        search: (prev: Record<string, unknown>) => ({ ...prev, cropping: "true" }),
        state: { ...history.state, _cropOriginKupuaKey: history.state?.kupuaKey },
      });
    };
    if (imageFullscreenElement()) void document.exitFullscreen().then(enter).catch(() => {});
    else enter();
  }, [navigate, path, canCrop, imageId]);
  const closeCrop = useCallback(() => {
    if (history.state?._cropOriginKupuaKey) {
      markUserInitiatedNavigation();
      history.back();
      return;
    }
    navigate({
      to: path,
      search: (prev: Record<string, unknown>) => ({ ...prev, cropping: undefined }),
      replace: true,
      state: withCurrentKupuaKey(),
    });
  }, [navigate, path]);
  useKeyboardShortcut("c", () => { if (!cropping && image) openCrop(); });

  // Keyboard shortcut: f = toggle fullscreen (via centralised shortcut system)
  // Alt+f works when focus is in an editable field.
  useKeyboardShortcut("f", () => { if (!cropping && !isCompact) toggleFullscreen(); });

  // Shared scaleRef — written by usePinchZoom, read by useSwipeCarousel
  // to suppress swipe when zoomed in. Created here to break the circular
  // dependency (swipe needs scaleRef, zoom needs lastSwipeTimeRef from swipe).
  const scaleRef = useRef(1);
  const drawerGestureEnabledRef = useRef(true);

  // Swipe carousel: horizontal swipe with visual slide-in animation.
  // Compact detail shares gestures with metadata; fullscreen uses the image container.
  // `enabled` toggles when the image loads — forces the effect to re-run after
  // the container DOM element exists (on reload, the loading spinner renders first).
  const { swipedRef, lastSwipeTimeRef, cancelSwipe } = useSwipeCarousel({
    containerRef,
    commitKey: isCompact ? `${searchKey}:${imageId}` : undefined,
    stripRef,
    onSwipeLeft: canGoNext ? goToNext : undefined,
    onSwipeRight: prevImage ? goToPrev : undefined,
    enabled: !!image,
    scaleRef,
  });
  cancelSwipeRef.current = cancelSwipe;

  const selectedCropAsset = useMemo(() => selectedCrop ? cropAsset(selectedCrop, "preview") : undefined, [selectedCrop]);
  const selectedCropUrl = selectedCropAsset?.secureUrl ?? selectedCropAsset?.file;
  const imgproxyOpts = useMemo(() => ({ width: window.screen.width, height: window.screen.height,
    nativeWidth: image?.source?.dimensions?.width, nativeHeight: image?.source?.dimensions?.height }), [image?.id]);
  const originalFullUrl = image ? getFullImageUrl(image, imgproxyOpts) : undefined;
  const thumbUrl = image ? getThumbnailUrl(image) : undefined;
  const mediaOwner = useMemo(() => ({ imageId, cropId: selectedCrop?.id }),
    [imageId, selectedCrop?.id, selectedCrop ? selectedCropUrl : originalFullUrl, selectedCrop ? undefined : thumbUrl]);
  const currentMediaOwnerRef = useRef(mediaOwner);
  currentMediaOwnerRef.current = mediaOwner;
  const [failedMediaOwner, setFailedMediaOwner] = useState<typeof mediaOwner | null>(null);
  const selectCrop = useCallback((cropId: string | undefined) => {
    const crop = cropId ? latestCrops(image?.exports).find(crop => crop.id === cropId) : undefined;
    if (cropId && (!cropPolicy.canReadExports || !crop || !allowsCropRatio(cropSettings, crop.specification?.aspectRatio))) return;
    setFailedMediaOwner(null);
    navigate({ to: path, search: (prev: Record<string, unknown>) => ({ ...prev, crop: cropId }),
      replace: true, state: withCurrentKupuaKey() });
  }, [navigate, path, image?.exports, cropSettings, cropPolicy.canReadExports]);
  const [isZoomed, setIsZoomed] = useState(false);
  usePinchZoom({
    containerRef: isCompact ? imageSurfaceRef : containerRef,
    imageRef,
    imageKey: selectedCrop ? `${imageId}:${selectedCrop.id}` : imageId,
    enabled: !!image && failedMediaOwner !== mediaOwner && !cropping && (isFullscreen || isCompact),
    lastSwipeTimeRef,
    scaleRef,
    onScaleChange: zoomed => {
      drawerGestureEnabledRef.current = !zoomed;
      setIsZoomed(zoomed);
      if (zoomed && isCompact) {
        setChromeVisible(false);
        setDrawerVisible(false);
        setCardExpanded(false);
      }
    },
    onDoubleClick: toggleFullscreen,
  });

  const touchCapable = useTouchCapable();
  useSwipeDismiss({
    containerRef: imageSurfaceRef,
    wrapperRef: detailWrapperRef,
    backdropRef: gridContainerRef,
    onDismiss: closeDetail,
    onDragStart: () => {
      // Pre-scroll the hidden grid to the current image so it's in the
      // right place as it fades in during the dismiss gesture.
      // BUT: only if the user traversed to a different image. If they're
      // still on the entry image, the grid's scroll position is already
      // perfect (preserved via opacity:0). Scrolling would re-center the
      // image when it was originally at a viewport edge.
      if (chooseDetailReturn(captureDetailEntry(imageId), imageId).placement === "center") {
        useSearchStore.getState().setFocusedImageId(imageId);
        scrollFocusedIntoView();
      }
    },
    enabled: !!image && isCompact && !cardExpanded,
    scaleRef,
    imageId,
  });

  const fullscreenTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleImageClick = useCallback(() => {
    if (swipedRef.current) return; // was a swipe, not a tap
    // Post-swipe cooldown — suppress accidental taps shortly after swiping (250ms)
    if (lastSwipeTimeRef.current && Date.now() - lastSwipeTimeRef.current < 250) return;
    if (!isCompact) return;
    if (fullscreenTapTimer.current) {
      clearTimeout(fullscreenTapTimer.current);
      fullscreenTapTimer.current = null;
      return;
    }
    fullscreenTapTimer.current = setTimeout(() => {
      fullscreenTapTimer.current = null;
      if (scaleRef.current > 1) return;
      setChromeVisible(visible => !visible);
      setDrawerVisible(false);
    }, DOUBLE_TAP_MS);
  }, [swipedRef, lastSwipeTimeRef, isCompact, scaleRef]);

  // Reset carousel strip and zoom when imageId changes. The carousel's
  // commitStripReset handles the visual transition imperatively (no flash),
  // but React re-renders with new panel content — this ensures the strip is
  // cleanly at translateX(0) for the new image. Also cancels any pending
  // fullscreen-exit tap timer from the previous image.
  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (strip) {
      strip.style.transition = "none";
      strip.style.transform = "";
    }
    // Cancel pending fullscreen tap timer from previous image
    if (fullscreenTapTimer.current) {
      clearTimeout(fullscreenTapTimer.current);
      fullscreenTapTimer.current = null;
    }
    // Reset pinch-zoom state — new image starts at 1x
    scaleRef.current = 1;
    drawerGestureEnabledRef.current = true;
    setIsZoomed(false);
    const img = imageRef.current;
    if (img) {
      img.style.transform = "";
      img.style.willChange = "";
      img.style.transition = "";
    }
  }, [imageId, selectedCrop?.id, scaleRef]);

  // ── Zoom-enhanced hi-res loading ───────────────────────────────
  // When the user zooms past 1× in fullscreen, load a higher-resolution
  // image (2× the standard DPR) so pinch/wheel zoom reveals extra detail.
  // On zoom-out or image change, cancel the in-flight fetch. StableImg's
  // layoutEffect will revert to the standard-res URL on its next render.
  useEffect(() => {
    if (!isZoomed || (!isFullscreen && !isCompact) || !image || selectedCrop) return;
    const zoomUrl = getZoomImageUrl(image);
    if (!zoomUrl) return;
    const img = imageRef.current;
    if (img && img.src === new URL(zoomUrl, window.location.href).href) return;

    let cancelled = false;
    const loader = new window.Image();
    loader.src = zoomUrl;
    loader.decode().then(() => {
      if (cancelled) return;
      const el = imageRef.current;
      if (el) el.src = zoomUrl;
    }).catch(() => { /* cancelled or decode error — ignore */ });

    return () => {
      cancelled = true;
      loader.src = ""; // abort in-flight fetch
    };
  }, [isZoomed, isFullscreen, isCompact, image?.id, selectedCrop?.id]);

  // Navigation keyboard shortcuts (arrows, backspace) — these are NOT
  // single-character shortcuts, so they don't go through the shortcut
  // registry. They only work when not typing in an input.
  useEffect(() => {
    if (cropping) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (detailWrapperRef.current?.querySelector('[role="menu"], [data-image-action-popup]')) return;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      )
        return;

      switch (e.key) {
        case "Backspace":
          e.preventDefault();
          closeDetail();
          break;
        case "ArrowLeft":
          if (scaleRef.current <= 1) { e.preventDefault(); goToPrev(); }
          break;
        case "ArrowRight":
          if (scaleRef.current <= 1) { e.preventDefault(); goToNext(); }
          break;
        // Escape exits fullscreen — handled natively by the browser.
        // When not in fullscreen, Escape does nothing. Close image detail
        // via Backspace, the back button, or browser back.
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeDetail, goToPrev, goToNext, cropping]);

  // Middle-click toggles fullscreen (undiscoverable power-user shortcut).
  // Uses mouseup (not auxclick) because auxclick doesn't carry transient
  // user activation in Firefox — requestFullscreen() fails silently.
  // preventDefault on mousedown suppresses browser autoscroll mode.
  // `image` in deps: on reload, the loading placeholder renders first (no
  // containerRef div). When image arrives the real div mounts — we need the
  // effect to re-run so it can bind to it.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onMiddleUp = (e: MouseEvent) => {
      if (e.button !== 1) return;
      e.preventDefault();
      // setTimeout breaks out of the mouse-handler stack — Firefox blocks
      // requestFullscreen() called from inside a non-left-button handler.
      // Transient user activation survives ~5s, so the deferred call works.
      setTimeout(toggleFullscreen, 0);
    };
    const onMiddleDown = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault();
    };
    el.addEventListener("mouseup", onMiddleUp);
    el.addEventListener("mousedown", onMiddleDown);
    return () => {
      el.removeEventListener("mouseup", onMiddleUp);
      el.removeEventListener("mousedown", onMiddleDown);
    };
  }, [toggleFullscreen, image]);

  const fullUrl = selectedCrop ? selectedCropUrl : originalFullUrl;

  // Prev/next image URLs for the swipe carousel.
  // Use full-res AVIF when the prefetch pipeline has fully decoded it
  // (img.decode() resolved → bitmap in Chrome's decoded-image cache).
  // A new DOM <img> with the same URL finds the cached bitmap and
  // paints immediately — no ⏳ window, no stale-compositor-texture
  // duplication. When NOT decoded yet (rapid swipes outpace prefetch),
  // fall back to thumbnail (~5KB JPEG, decodes in <10ms).
  //
  // prefetchGen triggers re-computation when a decode completes for one
  // of the current side-panel images (upgrades THUMB → FULL-RES without
  // waiting for a navigation-driven re-render).
  const [prefetchGen, setPrefetchGen] = useState(0);
  useEffect(() => {
    return onFullResDecoded((id) => {
      if (id === prevImage?.id || id === nextImage?.id) {
        setPrefetchGen((g) => g + 1);
      }
    });
  }, [prevImage?.id, nextImage?.id]);

  const prevImageUrl = useMemo(() => {
    if (!prevImage) return undefined;
    if (isFullResLoaded(prevImage.id)) {
      const fullRes = getCarouselImageUrl(prevImage);
      if (fullRes) return fullRes;
    }
    return getThumbnailUrl(prevImage);
  }, [prevImage?.id, prefetchGen]);

  const nextImageUrl = useMemo(() => {
    if (!nextImage) return undefined;
    if (isFullResLoaded(nextImage.id)) {
      const fullRes = getCarouselImageUrl(nextImage);
      if (fullRes) return fullRes;
    }
    return getThumbnailUrl(nextImage);
  }, [nextImage?.id, prefetchGen]);

  const imageUrl = cropping || failedMediaOwner === mediaOwner ? undefined : selectedCrop ? fullUrl : (fullUrl ?? thumbUrl);
  const displayedAsset = imageRef.current;
  const cropPreviewSrc = cropping || selectedCrop ? originalFullUrl ?? thumbUrl : displayedAsset?.complete && displayedAsset.naturalWidth > 0 && thumbUrl
    && displayedAsset.currentSrc === new URL(thumbUrl, window.location.href).href ? thumbUrl : imageUrl;


  // Delay showing the loading indicator so it doesn't flash on fast loads
  // (tab reload, cached ES responses).  Only appears after 500ms of waiting.
  const [loadingImageId, setLoadingImageId] = useState<string | null>(null);
  useEffect(() => {
    setLoadingImageId(null);
    if (image) return;
    const timer = setTimeout(() => setLoadingImageId(imageId), 500);
    return () => clearTimeout(timer);
  }, [imageId, image]);

  const displayImage = image;
  const suppressFullFrame = Boolean(cropSettings.lockedType !== undefined || !cropping && !isCompact && !isFullscreen && displayImage && imageHasFullFrame(displayImage));
  const actionContext: ImageActionContext = {
    api: import.meta.env.VITE_USE_MEDIA_API === "true", archive: null,
    targets: [{ id: imageId, image: displayImage?.id === imageId ? displayImage : undefined,
      overlay: displayImage?.id === imageId && actionImage ? { resource: actionImage.resource,
        actions: actionImage.actions, persisted: actionImage.persisted, valid: actionImage.valid } : undefined,
      pending: displayImage?.id !== imageId || actionImage?.metadataStale }],
  };
  const goHome = () => {
    if (path === "/upload") captureBrowsingDeparture(router.state.location);
    void resetToHome(() => pushNavigateAsPopstate(navigate, { to: "/search", search: DEFAULT_SEARCH }),
      undefined, router.history);
  };
  const pairedPages = isCompact;
  const imageSurfaceClass = `absolute inset-x-0 top-0 flex items-center justify-center ${
    pairedPages
      ? cardExpanded ? "h-1/4" : "h-full"
      : "h-full"
  }${isFullscreen ? " touch-none" : " touch-none wide:touch-auto"} ${isFullscreen || isCompact ? "bg-black" : "bg-grid-bg"}`;
  const imageClass = isFullscreen || isCompact ? "w-full h-full object-contain select-none" : "max-w-full max-h-full object-contain select-none";
  const renderMetadata = (detailImage: Image, overlay?: EnrichmentFields) => <>
    <AccordionSection sectionId="detail-metadata" contentId={`detail-metadata-${detailImage.id}`} title="Details">
      <div className="p-3">
        <ImageMetadata image={detailImage} overlay={overlay} editingPending={detailImage.id !== imageId} />
      </div>
    </AccordionSection>
    <AccordionSection
      sectionId="detail-usages"
      contentId={`detail-usages-${detailImage.id}`}
      title={`Usages${countDisplayUsages(detailImage.usages) > 0 ? ` (${countDisplayUsages(detailImage.usages)})` : ""}`}
    >
      <UsagesSection usages={detailImage.usages} />
    </AccordionSection>
  </>;
  const renderCard = (detailImage: Image, current = false) => <BottomSheet
    contentKey={detailImage.id}
    label="Image details"
    position="absolute"
    dragSurfaceRef={current ? imageSurfaceRef : undefined}
    header={detailImage.metadata?.title ?? detailImage.metadata?.description ?? detailImage.metadata?.credit ?? "Details"}
    expanded={cardExpanded}
    onExpandedChange={setCardExpanded}
    visible={chromeVisible || drawerVisible || cardExpanded}
    gestureEnabledRef={drawerGestureEnabledRef}
    onRevealDrag={() => setDrawerVisible(true)}
    overlay
    scrim={false}
    headerActions={<ImageActionFab docked context={current ? actionContext : {
      api: actionContext.api, archive: null, targets: [{ id: detailImage.id, image: detailImage }],
    }} detailsExpanded={cardExpanded} closeSignal={actionsCloseSignal} />}
    onDragStart={current ? () => setActionsCloseSignal(value => value + 1) : undefined}
  >
    {renderMetadata(detailImage, current && !imageFromResults ? standaloneEnrichment : undefined)}
    {current && <AccordionSection sectionId="detail-crops" contentId={`detail-crops-${detailImage.id}`} title="Crops">
      <MobileImageCrops key={detailImage.id} active={cardExpanded && !cropping} image={detailImage} canReadExports={cropPolicy.canReadExports} selectedId={selectedCrop?.id} settings={cropSettings} compact onSelect={selectCrop} />
    </AccordionSection>}
  </BottomSheet>;
  const renderNeighbor = (detailImage: Image, src: string | undefined, slot: "previous" | "next") => <div
    className="absolute inset-0"
    data-detail-page={slot}
    data-detail-page-id={detailImage.id}
    style={{ transform: slot === "previous" ? "translateX(-100%)" : "translateX(100%)" }}
    aria-hidden="true"
    inert
  >
    <div className={imageSurfaceClass}>
      <StableImg src={src} data-thumb={getThumbnailUrl(detailImage)} alt="" className={imageClass} draggable={false} />
    </div>
    {pairedPages && renderCard(detailImage)}
  </div>;
  const cropLoading = <div className="flex h-full flex-col" aria-busy="true">
    <header className="crop-toolbar @container/detail-toolbar flex h-11 shrink-0 items-center border-b border-grid-separator px-3">
      <DetailNavigation destination="image" onBack={closeCrop} onHome={goHome} />
      <span className="flex-1" />
      <div className="detail-settings shrink-0"><SettingsMenu /></div>
    </header>
    {!displayImage && (availability || standaloneFetchFailed || loadingImageId === imageId) && <p role="status" className="flex flex-1 items-center justify-center text-sm text-grid-text-muted">
      {availability ? availability === "deleted" ? "Image deleted" : "Image unavailable" : standaloneFetchFailed ? standaloneFailureText : "Loading image..."}
    </p>}
  </div>;

  return (
    <div ref={detailWrapperRef} className={`relative flex flex-col flex-1 min-h-0 ${isCompact ? "bg-black" : "bg-grid-bg"}`} data-detail-image-id={resolvedImage?.id}>
      {cropping && <div className="fixed inset-0 z-50 bg-grid-bg" data-testid="crop-backdrop">
        {displayImage ? <Suspense fallback={cropLoading}><CropEditor image={displayImage} actionImage={actionImage} previewSrc={cropPreviewSrc} onClose={closeCrop} onHome={goHome} /></Suspense> : cropLoading}
      </div>}
      {/* Top bar — hidden in fullscreen */}
      {(!isFullscreen || isCompact) && (
        <header inert={cropping || (isCompact && !chromeVisible)} aria-hidden={isCompact && !chromeVisible || undefined} data-visible={isCompact ? chromeVisible : undefined} style={isCompact ? { background: "linear-gradient(to bottom, rgba(0,0,0,0.88), rgba(0,0,0,0.72))" } : undefined} className={`detail-toolbar @container/detail-toolbar z-30 flex items-center px-3 py-1.5 h-11 shrink-0 ${isCompact ? "chrome-fade absolute inset-x-0 top-0 text-white" : "relative bg-grid-bg border-b border-grid-separator"}`}>
          <DetailNavigation destination="search" onBack={closeDetail} onHome={goHome} />
          <div className="w-px h-5 bg-grid-separator shrink-0" />
          {currentGlobalIndex >= 0 && (
            <span className="detail-position flex shrink-0 flex-col items-center px-3 tabular-nums whitespace-nowrap @min-[640px]/detail-toolbar:flex-row @min-[640px]/detail-toolbar:gap-1">
              <span className="text-sm leading-4 font-semibold text-grid-text-bright">{(currentGlobalIndex + 1).toLocaleString()}</span>
              {" "}
              {currentGlobalIndex < total && <span className="text-2xs wide:text-sm leading-4 text-grid-text-muted">of {total.toLocaleString()}</span>}
            </span>
          )}

          <span className="flex-1" />

          {!isCompact && displayImage && <ImageActions context={actionContext} presentation="detail" actions={["share", "download", "delete", "library"]} />}
          {displayImage && (
            <>
              <div className="w-px h-5 bg-grid-separator shrink-0" />
              <div className="detail-crop-actions contents wide:inline-flex wide:shrink-0 wide:self-center wide:h-11">
              <button
                onClick={openCrop}
                disabled={!canCrop}
                aria-label={canCrop ? "Crop image" : "Cannot crop"}
                title={canCrop ? "Crop image [c]" : "Cannot crop"}
                className={`detail-crop shrink-0 min-w-11 h-11 inline-flex items-center justify-center gap-1.5 pl-3 ${suppressFullFrame ? "pr-3" : "pr-1"} text-sm text-grid-text-muted enabled:hover:bg-grid-hover enabled:hover:text-grid-text disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer`}
              >
                <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                  <path d="M6 2v16h16M2 6h16v16" />
                </svg>
                <span className="hidden @min-[360px]/detail-toolbar:inline whitespace-nowrap">
                  {canCrop ? <>Crop<span className="hidden @min-[640px]/detail-toolbar:inline"> image</span></> : "Cannot crop"}
                </span>
              </button>
              {!isCompact && !suppressFullFrame && <FullFrameOptions context={actionContext} />}
              </div>
              <div aria-hidden="true" className="w-px h-5 bg-grid-separator shrink-0" />
            </>
          )}
          <div className="detail-settings shrink-0"><SettingsMenu /></div>
        </header>
      )}

      {/* Main content area.
          Desktop: flex-row (image fills left, metadata sidebar right). No scroll on outer.
          Mobile: single scrollable column (image top, metadata below).
          Fullscreen: image fills viewport, no sidebar. */}
      <div
        ref={mobileScrollRef}
        inert={cropping}
        onClickCapture={isCompact ? (event) => {
          if ((event.target as Element).closest('[aria-haspopup="menu"],[role="menu"]')) return;
          if (swipedRef.current && event.detail > 0) {
            event.preventDefault();
            event.stopPropagation();
          }
        } : undefined}
        className={
          isFullscreen
            ? "flex-1 flex min-h-0"
            : "flex-1 flex min-h-0 overflow-y-auto wide:overflow-clip overscroll-y-contain overscroll-x-none flex-col wide:flex-row touch-pan-y wide:touch-auto"
        }
      >
        {!cropping && !isFullscreen && !isCompact && displayImage && <aside aria-label="Image original and crops select"
          className="w-[130px] shrink-0 border-r border-grid-separator bg-grid-bg overflow-y-auto overflow-x-clip">
          <ImageCrops key={displayImage.id} image={displayImage} canReadExports={cropPolicy.canReadExports} selectedId={selectedCrop?.id} settings={cropSettings} onSelect={selectCrop} />
        </aside>}
        {/* Fullscreen container and horizontal page viewport. overflow-clip clips
          neighbouring pages without creating a trackpad scroll container.
          Compact pages contain both the image surface and its metadata card. */}
        <div
          ref={containerRef}
          className={`relative overflow-clip ${
            isFullscreen
              ? `w-full h-full touch-none${cursorHidden ? " cursor-none" : ""}`
              : `wide:flex-1 min-w-0 ${isCompact ? "flex-1 min-h-0" : "shrink-0 h-[calc(100%-64px)] wide:h-full"} touch-pan-y wide:touch-auto`
          }`}
        >
          {/* Carousel strip — three panels (prev | current | next).
              Translated by useSwipeCarousel during horizontal swipe.
              Prev/next are offset ±100% so only the current panel is visible at rest. */}
          <div ref={stripRef} className={`absolute inset-0${touchCapable ? " will-change-transform" : ""}`}>
            {/* Previous image (off-screen left) — used by swipe animation on mobile.
                Only touch-capable devices need off-screen swipe panels. */}
              {!cropping && touchCapable && prevImage && (prevImageUrl || pairedPages) && (
              renderNeighbor(prevImage, prevImageUrl, "previous")
            )}

            {/* Current image — full-res via imageUrl */}
            <div className="absolute inset-0" data-detail-page="current" data-detail-page-id={displayImage?.id}>
              <div
                ref={imageSurfaceRef}
                data-testid="detail-image-container"
                className={imageSurfaceClass}
                onClickCapture={isCompact && cardExpanded ? (event) => { event.stopPropagation(); setCardExpanded(false); } : undefined}
              >
              {!displayImage ? (
                <div className="text-grid-text-muted text-center">
                  {availability ? (
                    <p role="status" className="text-lg">{availability === "deleted" ? "Image deleted" : "Image unavailable"}</p>
                  ) : standaloneFetchFailed ? (
                    <p className="text-lg">{standaloneFailureText}</p>
                  ) : loadingImageId === imageId ? (
                    <p className="text-sm animate-pulse">Loading image…</p>
                  ) : null}
                </div>
              ) : imageUrl ? (
                <StableImg
                  imgRef={imageRef}
                  src={imageUrl}
                  fetchPriority="high"
                  alt={displayImage.metadata?.title ?? displayImage.metadata?.description ?? ""}
                  className={imageClass}
                  draggable={false}
                  onClick={handleImageClick}
                  onLoad={(event) => {
                    if (currentMediaOwnerRef.current !== mediaOwner || event.currentTarget !== imageRef.current) return;
                    // Mark this image as loaded so side-panel probes can use
                    // full-res instead of thumbnail on future swipes.
                    if (imageId && !selectedCrop) markFullResLoaded(imageId);
                  }}
                  onDoubleClick={
                    // Fullscreen: no dblclick — click-to-zoom handles interaction.
                    // Non-fullscreen desktop: dblclick closes detail.
                    // Mount guard: suppress stray dblclick from phantom-mode grid/table
                    // click leaking through (see mountTimeRef).
                    isFullscreen || isCompact ? undefined
                      : () => {
                          if (Date.now() - mountTimeRef.current < 500) return;
                          closeDetail();
                        }
                  }
                  onError={(e) => {
                    if (currentMediaOwnerRef.current !== mediaOwner || e.currentTarget !== imageRef.current) return;
                    // imgproxy failed — try thumbnail as fallback
                    const target = e.currentTarget;
                    if (!selectedCrop && thumbUrl && target.src !== new URL(thumbUrl, window.location.href).href) {
                      target.src = thumbUrl;
                    } else {
                      // Both imgproxy and thumbnail failed — show text fallback
                      setFailedMediaOwner(mediaOwner);
                    }
                  }}
                />
              ) : (
                <div className="text-grid-text-muted text-sm text-center p-4">
                  <p>Image preview not available</p>
                  {!fullUrl && !thumbUrl && (
                    <p className="mt-1 text-grid-text-dim">
                      Run with <code>--use-TEST</code> to enable image viewing
                    </p>
                  )}
                </div>
              )}
              </div>
              {pairedPages && displayImage && renderCard(displayImage, true)}
            </div>

            {/* Next image (off-screen right) — used by swipe animation on mobile. */}
            {!cropping && touchCapable && nextImage && (nextImageUrl || pairedPages) && (
              renderNeighbor(nextImage, nextImageUrl, "next")
            )}
          </div>

          {/* Prev/next navigation strips — desktop only (mobile uses swipe).
              Positioned on top of the carousel strip. */}
          {!(isFullscreen && cursorHidden) && !isZoomed && prevImage && (
            <NavStrip direction="prev" onClick={goToPrev} onMouseEnter={navMouseEnter} onMouseLeave={navMouseLeave} className="hidden wide:flex" revealed={touchControlsVisible} />
          )}
          {!(isFullscreen && cursorHidden) && !isZoomed && canGoNext && (
            <NavStrip direction="next" onClick={goToNext} onMouseEnter={navMouseEnter} onMouseLeave={navMouseLeave} className="hidden wide:flex" revealed={touchControlsVisible} />
          )}
          {!(isFullscreen && cursorHidden) && (
            <FullscreenCornerButton isFullscreen={isFullscreen} onClick={toggleFullscreen} className="hidden wide:flex" revealed={touchControlsVisible} />
          )}
        </div>

        {/* Desktop metadata stays outside the horizontal track; compact cards
          belong to their pages and are absent in fullscreen. */}
        {!isFullscreen && displayImage && !isCompact && (
            <aside className="w-72 shrink-0 border-l border-grid-separator bg-grid-bg overflow-y-auto overflow-x-clip">
              {renderMetadata(displayImage, imageFromResults ? undefined : standaloneEnrichment)}
            </aside>
        )}
      </div>
    </div>
  );
}

