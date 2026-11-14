/**
 * Crop editor — dry run. Rendered by ImageDetail when `cropping=true`.
 *
 * Builds Kahuna's cropper-service request and shows it; nothing is sent.
 */

import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent, type RefObject } from "react";
import type { Image } from "@/types/image";
import { useBlocker } from "@tanstack/react-router";
import { DetailNavigation } from "@/components/DetailNavigation";
import { FullscreenCornerButton } from "@/components/NavStrip";
import { ToastNotice } from "@/components/ToastContainer";
import { SettingsMenu } from "@/components/SettingsMenu";
import { useIsCompact } from "@/hooks/useShell";
import { useCursorAutoHide } from "@/hooks/useCursorAutoHide";
import { getFullImageUrl, getThumbnailUrl, getZoomImageUrl } from "@/lib/image-urls";
import { SQUARE_KEY, type CropOption } from "@/lib/crop/crop-options";
import { useCropSettings } from "@/hooks/useCropSettings";
import { flushCropDraft, queueCropDraft, readCropDraft } from "@/lib/crop/crop-draft";
import { gridConfig } from "@/lib/grid-config";
import {
  buildCropRequest, cropCoordinateLimits, defaultCropRect, editCropRect, isValidCropRect, MIN_RECOMMENDED_CROP_WIDTH, originalCropSize, toOriginalRect,
  type CropRequest, type Rect,
} from "@/lib/crop/crop-request";
import { isGridSessionInvalidated, serviceLink, subscribeGridSessionInvalidation } from "@/lib/grid-api-instance";
import type { EnrichedImage } from "@/lib/derive-enriched-image";
import { cropAccess } from "@/lib/crop/crop-policy";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";
import { restrictShortcuts } from "@/lib/keyboard-shortcuts";
import { CropCanvas, type CropCanvasHandle, type CropCanvasState } from "./CropCanvas";

const CIRCULAR_MASK_KEY = "kupua.crop.circularMask";
const KEYBOARD_EXPANSION_SETTLE_MS = 120;
const VIEWPORT_JITTER_PX = 8;

function initialCircularMask(): boolean {
  try {
    return localStorage.getItem(CIRCULAR_MASK_KEY) !== "false";
  } catch {
    return true;
  }
}

interface CropEditorProps {
  image: Image;
  actionImage?: EnrichedImage;
  previewSrc?: string;
  onClose: () => void;
  onHome?: () => void;
}

export function CropEditor({ image, actionImage, previewSrc, onClose, onHome }: CropEditorProps) {
  const isCompact = useIsCompact();
  const api = import.meta.env.VITE_USE_MEDIA_API === "true";
  const sessionInvalidated = useSyncExternalStore(subscribeGridSessionInvalidation, isGridSessionInvalidated, () => false);
  const acceptedImage = actionImage?.id === image.id ? actionImage : undefined;
  const creationReason = api || actionImage ? cropAccess(acceptedImage, api, sessionInvalidated).creationReason
    ?? (api && !acceptedImage?.resource?.uri ? "Image source is not ready" : undefined) : undefined;
  const [precisionOpen, setPrecisionOpen] = useState(false);
  const precisionRef = useRef<HTMLButtonElement>(null);
  const precisionId = useId();
  const precisionWasOpen = useRef(false);
  const precisionPanelRef = useRef<HTMLElement>(null);
  const precisionAnimation = useRef<Animation | null>(null);
  const precisionDrag = useRef<{ pointer: number; x: number; y: number; lastY: number; time: number; velocity: number; decided: boolean; tracking: boolean } | null>(null);
  const { settings, revision } = useCropSettings();
  const original = originalCropSize(image);
  const draft = useMemo(() => readCropDraft(image.id, original, settings),
    [image.id, original?.width, original?.height, settings]);
  const initialType = draft?.cropKey ?? settings.initialType;
  const [choice, setChoice] = useState({ revision, imageId: image.id, key: initialType });
  const [selectionRevision, setSelectionRevision] = useState(0);
  const cropKey = choice.revision === revision && choice.imageId === image.id ? choice.key : initialType;
  const editorRef = useRef<HTMLDivElement>(null);
  const imageViewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<CropCanvasHandle>(null);
  const cropActionRef = useRef<HTMLButtonElement>(null);
  const viewControlsRef = useRef<HTMLDivElement>(null);
  const [panMode, setPanMode] = useState(false);
  const [altHeld, setAltHeld] = useState(false);
  const [panHint, setPanHint] = useState(false);
  const panHintSeen = useRef(false);
  const desktop = !isCompact;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { touchControlsVisible } = useCursorAutoHide(isFullscreen, isCompact ? undefined : imageViewportRef);
  const viewport = useCropViewport(isCompact && !isFullscreen, precisionOpen, editorRef);
  const keyboardOpen = precisionOpen && (viewport?.keyboardOpen ?? false);
  const fullscreenRef = useRef(false);
  const escapeGuardUntil = useRef(0);
  useLayoutEffect(() => {
    const wasOpen = precisionWasOpen.current;
    precisionWasOpen.current = precisionOpen;
    if (isCompact && precisionOpen && !isFullscreen) {
      editorRef.current?.querySelector<HTMLInputElement>('input[aria-label="Crop x"]')?.focus({ preventScroll: true });
    } else if (isCompact && wasOpen && !precisionOpen) {
      precisionRef.current?.focus({ preventScroll: true });
    }
  }, [isCompact, precisionOpen, isFullscreen]);
  function revealCoordinate() {
    const panel = precisionPanelRef.current;
    const active = document.activeElement;
    if (!panel || !(active instanceof HTMLInputElement) || !panel.contains(active)) return;
    const bounds = panel.getBoundingClientRect();
    if (!bounds.height) return;
    const input = active.getBoundingClientRect();
    const headerBottom = panel.firstElementChild?.getBoundingClientRect().bottom ?? bounds.top;
    if (input.bottom > bounds.bottom - 8) panel.scrollTop += input.bottom - bounds.bottom + 8;
    else if (input.top < headerBottom + 8) panel.scrollTop -= headerBottom + 8 - input.top;
  }
  useLayoutEffect(() => { revealCoordinate(); }, [precisionOpen, viewport?.height, viewport?.top]);
  useEffect(() => () => {
    precisionAnimation.current?.cancel();
    precisionAnimation.current = null;
    precisionDrag.current = null;
  }, [precisionOpen]);
  useEffect(() => {
    const change = () => {
      const active = document.fullscreenElement === editorRef.current;
      if (fullscreenRef.current && !active) escapeGuardUntil.current = performance.now() + 250;
      fullscreenRef.current = active;
      setIsFullscreen(active);
      if (active) editorRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, []);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement === editorRef.current) {
      void document.exitFullscreen().catch(() => {});
    } else if (desktop) {
      void editorRef.current?.requestFullscreen?.().catch(() => {});
    }
  }, [desktop]);
  const option: CropOption = settings.options.find((o) => o.key === cropKey) ?? settings.options[0];
  const [sourceTemplate, setSourceTemplate] = useState<string>();
  const [circularMask, setCircularMask] = useState(initialCircularMask);
  // Kahuna: GNM square crops get a circle (avatars/bylines); mask by default.
  const showCircle = gridConfig.staffPhotographerOrganisation === "GNM" && option.key === SQUARE_KEY;
  const circle = showCircle ? (circularMask ? "mask" : "guide") : undefined;

  useEffect(() => {
    if (api || acceptedImage?.resource?.uri) return;
    let live = true;
    void serviceLink("image").then((href) => { if (live) setSourceTemplate(href); });
    return () => { live = false; };
  }, [api, acceptedImage?.resource?.uri]);
  const sourceUri = acceptedImage?.resource?.uri ?? sourceTemplate?.replace("{id}", encodeURIComponent(image.id)) ?? `<media-api>/images/${image.id}`;

  const src = useMemo(
    () => previewSrc ?? getFullImageUrl(image, {
      width: window.screen.width,
      height: window.screen.height,
      nativeWidth: image.source?.dimensions?.width,
      nativeHeight: image.source?.dimensions?.height,
    }) ?? getThumbnailUrl(image),
    [image, previewSrc],
  );
  const zoomSrc = useMemo(() => getZoomImageUrl(image), [image]);

  const mediaOwner = useMemo(() => ({}), [image.id, src]);
  const [zoomState, setZoomState] = useState<{ owner: object; zoomed: boolean }>();
  const zoomed = zoomState?.owner === mediaOwner && zoomState.zoomed;
  const onZoomChange = useCallback((active: boolean) => {
    setZoomState({ owner: mediaOwner, zoomed: active });
    if (!active) {
      setPanMode(!isCompact && fullscreenRef.current);
      if (viewControlsRef.current?.contains(document.activeElement)) cropActionRef.current?.focus({ preventScroll: true });
    } else if (isCompact && !panHintSeen.current) {
      panHintSeen.current = true;
      setPanHint(true);
    }
  }, [mediaOwner, isCompact]);
  useEffect(() => {
    setPanMode(!isCompact && isFullscreen);
    setAltHeld(false);
    setPanHint(false);
  }, [mediaOwner, isCompact, isFullscreen]);
  useEffect(() => {
    if (!panHint) return;
    let tap: { pointer: number; x: number; y: number; time: number } | null = null;
    const down = (event: globalThis.PointerEvent) => {
      if (event.isPrimary === false || event.button !== 0 || tap) { tap = null; return; }
      tap = { pointer: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp };
    };
    const move = (event: globalThis.PointerEvent) => {
      if (tap && (event.pointerId !== tap.pointer || Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 8)) tap = null;
    };
    const up = (event: globalThis.PointerEvent) => {
      if (tap && event.pointerId === tap.pointer && event.timeStamp - tap.time <= 500
        && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) <= 8) setPanHint(false);
      tap = null;
    };
    const cancel = () => { tap = null; };
    const timer = window.setTimeout(() => setPanHint(false), 4000);
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", cancel, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", cancel, true);
    };
  }, [panHint]);
  const owner = useMemo(() => ({}), [image.id, src, cropKey, revision, selectionRevision, original?.width, original?.height]);
  const currentOwner = useRef(owner);
  currentOwner.current = owner;
  const editingCoordinate = useRef(false);
  const [coordinateDrafts, setCoordinateDrafts] = useState<{ owner: object; values: Partial<Record<keyof Rect, string>> }>();
  const inputDrafts = coordinateDrafts?.owner === owner ? coordinateDrafts.values : {};
  const [canvasState, setCanvasState] = useState<{ owner: object; mediaOwner: object; value: CropCanvasState }>();
  const [dryRun, setDryRun] = useState<{ state: typeof canvasState; source: string; authority?: EnrichedImage; request: CropRequest }>();
  const state = canvasState?.owner === owner ? canvasState.value : undefined;
  const mediaStatus = canvasState?.mediaOwner === mediaOwner ? canvasState.value.status : "loading";
  const rect = original && state?.status === "ready" && state.selection
    && isValidCropRect(state.selection, state.rendition)
    ? toOriginalRect(state.selection, state.rendition, original, cropKey) : undefined;
  const coordinateLimits = (field: keyof Rect) => rect && original
    ? cropCoordinateLimits(rect, field, original, option.ratio) : { min: field === "x" || field === "y" ? 0 : 1, max: 0 };
  const invalidCoordinate = (field: keyof Rect) => {
    const text = inputDrafts[field];
    if (text === undefined || !rect) return false;
    const value = Number(text);
    const { min, max } = coordinateLimits(field);
    return text.trim() === "" || !Number.isInteger(value) || value < min || value > max || value !== rect[field];
  };
  const invalidCoordinates = (["x", "y", "width", "height"] as const).some(invalidCoordinate);
  const departureScope = useMemo(() => ({}), [image.id, src, cropKey, revision, original?.width, original?.height]);
  const initialScope = useRef(departureScope);
  const departureFrame = useRef<{ scope: object; mediaOwner: object; defaultRect: Rect; signature: string | null;
    priorFrameEdits: boolean }>(undefined);
  const restoredDraft = initialScope.current === departureScope ? draft : undefined;
  const inheritedEdits = departureFrame.current?.mediaOwner === mediaOwner
    && departureFrame.current.scope !== departureScope && departureFrame.current.signature !== null;
  const initialSignature = restoredDraft && original
    ? cropDepartureSignature(image.id, cropKey, restoredDraft.rect,
      restoredDraft.defaultRect ?? toOriginalRect(defaultCropRect(original, option.ratio), original, original, cropKey),
      restoredDraft.priorFrameEdits) : null;
  const signature = departureFrame.current?.scope === departureScope ? departureFrame.current.signature
    : inheritedEdits ? JSON.stringify([image.id, cropKey, "prior-frame-edits"]) : initialSignature;
  const confirmDeparture = useCropDepartureGuard(image.id, signature);
  const close = useCallback(() => { if (confirmDeparture()) onClose(); }, [confirmDeparture, onClose]);
  const home = useCallback(() => { if (confirmDeparture()) onHome?.(); }, [confirmDeparture, onHome]);
  const onSelection = useCallback((value: CropCanvasState) => {
    if (currentOwner.current !== owner) return;
    if (!editingCoordinate.current) setCoordinateDrafts(undefined);
    setCanvasState({ owner, mediaOwner, value });
    if (original && value.status === "ready" && (value.selection === null || isValidCropRect(value.selection, value.rendition))) {
      const rect = value.selection === null ? null : toOriginalRect(value.selection, value.rendition, original, cropKey);
      // Capture the actual initial frame: re-deriving it can round to a neighbouring original pixel.
      const defaultRect = departureFrame.current?.scope === departureScope ? departureFrame.current.defaultRect
        : restoredDraft?.defaultRect ?? (restoredDraft || rect === null
          ? toOriginalRect(defaultCropRect(value.rendition, option.ratio), value.rendition, original, cropKey) : rect);
      const priorFrameEdits = departureFrame.current?.scope === departureScope ? departureFrame.current.priorFrameEdits
        : inheritedEdits || restoredDraft?.priorFrameEdits === true;
      departureFrame.current = { scope: departureScope, mediaOwner, defaultRect, priorFrameEdits,
        signature: cropDepartureSignature(image.id, cropKey, rect, defaultRect, priorFrameEdits) };
      queueCropDraft({ version: 1, imageId: image.id, size: original, cropKey, ratio: option.ratio, rect, defaultRect, priorFrameEdits });
    }
  }, [owner, mediaOwner, departureScope]);

  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === "hidden") flushCropDraft(); };
    window.addEventListener("pagehide", flushCropDraft);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flushCropDraft);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const editCoordinate = (field: keyof Rect, text: string) => {
    setCoordinateDrafts(current => ({ owner, values: { ...(current?.owner === owner ? current.values : {}), [field]: text } }));
    const value = Number(text);
    const { min, max } = coordinateLimits(field);
    if (!rect || !original || text.trim() === "" || !Number.isInteger(value) || value < min || value > max) return;
    editingCoordinate.current = true;
    try { canvasRef.current?.setSelection(editCropRect(rect, field, value, original, option.ratio), original); }
    finally { editingCoordinate.current = false; }
  };
  const finishPrecision = useCallback(() => {
    precisionAnimation.current?.cancel();
    precisionAnimation.current = null;
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && editorRef.current?.contains(active)) active.blur();
    if (invalidCoordinates) return;
    setPrecisionOpen(false);
  }, [invalidCoordinates]);
  const finishPrecisionRef = useRef(finishPrecision);
  finishPrecisionRef.current = finishPrecision;
  const cancelPrecisionDrag = () => {
    precisionDrag.current = null;
    if (precisionPanelRef.current) {
      precisionPanelRef.current.style.transition = "transform 160ms ease-out";
      precisionPanelRef.current.style.transform = "";
    }
  };
  const startPrecisionDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.isPrimary === false || (event.target as Element).closest("button")) return;
    if (precisionDrag.current) { cancelPrecisionDrag(); return; }
    if (precisionAnimation.current) return;
    event.preventDefault();
    precisionDrag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, lastY: event.clientY,
      time: event.timeStamp, velocity: 0, decided: false, tracking: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const movePrecisionDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = precisionDrag.current;
    const panel = precisionPanelRef.current;
    if (!drag || drag.pointer !== event.pointerId || !panel) return;
    const vertical = event.clientY - drag.y;
    const horizontal = event.clientX - drag.x;
    if (!drag.decided) {
      if (Math.max(Math.abs(vertical), Math.abs(horizontal)) < 10) return;
      drag.decided = true;
      drag.tracking = vertical > 0 && Math.abs(vertical) > Math.abs(horizontal);
    }
    if (!drag.tracking) return;
    event.preventDefault();
    const elapsed = event.timeStamp - drag.time;
    if (elapsed > 0) drag.velocity = drag.velocity * 0.4 + (event.clientY - drag.lastY) / elapsed * 0.6;
    drag.lastY = event.clientY;
    drag.time = event.timeStamp;
    panel.style.transition = "none";
    panel.style.transform = `translateY(${Math.max(0, vertical)}px)`;
  };
  const endPrecisionDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = precisionDrag.current;
    const panel = precisionPanelRef.current;
    if (!drag || drag.pointer !== event.pointerId || !panel) return;
    precisionDrag.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const distance = event.clientY - drag.y;
    const commit = drag.tracking && drag.velocity >= 0 && (distance > 56 || (distance > 12 && drag.velocity > 0.4));
    if (!commit || invalidCoordinates) {
      cancelPrecisionDrag();
      if (commit) finishPrecision();
      return;
    }
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && editorRef.current?.contains(active)) active.blur();
    const from = panel.style.transform;
    panel.style.transform = "";
    const animation = panel.animate?.([{ transform: from }, { transform: `translateY(${panel.getBoundingClientRect().height}px)` }], { duration: 160, easing: "ease-out" });
    if (!animation) { finishPrecision(); return; }
    precisionAnimation.current = animation;
    animation.onfinish = () => {
      if (precisionAnimation.current !== animation) return;
      precisionAnimation.current = null;
      finishPrecisionRef.current();
    };
  };

  const selectType = useCallback((key: string) => {
    if (!settings.options.some((o) => o.key === key)) return;
    if (key === cropKey && state?.status === "ready" && !state.selection) {
      setSelectionRevision(value => value + 1);
    } else setChoice({ revision, imageId: image.id, key });
  }, [settings, revision, image.id, cropKey, state]);

  const submit = useCallback(() => {
    if (creationReason || api && isGridSessionInvalidated() || !rect || !original || invalidCoordinates || !isValidCropRect(rect, original)) return;
    const request = buildCropRequest(sourceUri, rect, option);
    setDryRun({ state: canvasState, source: sourceUri, authority: acceptedImage, request });
    console.info("[crop dry run] POST cropper `crop` link", request);
  }, [rect, original, sourceUri, acceptedImage, creationReason, api, option, canvasState, invalidCoordinates]);

  // Kahuna: Esc cancels, Enter crops. Capture phase keeps detail's own keys out.
  useEffect(() => {
    const previousFocus = document.activeElement;
    editorRef.current?.focus();
    return () => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "Escape" && editorRef.current?.querySelector('[role="menu"]')) return;
      if (e.altKey && !e.metaKey && !e.ctrlKey && (e.code === "KeyF" || e.key.toLowerCase() === "f")) {
        e.preventDefault(); e.stopImmediatePropagation();
        if (!e.repeat) toggleFullscreen();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) {
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Delete", "Backspace", "+", "-"].includes(e.key)) {
          e.stopImmediatePropagation();
        }
        return;
      }
      if (!e.shiftKey && t.closest("cropper-handle,cropper-selection")) {
        const match = [...settings.options].reverse().find(option => option.key.charAt(0).toLowerCase() === e.key.toLowerCase());
        if (match) {
          e.preventDefault(); e.stopImmediatePropagation(); selectType(match.key);
          return;
        }
      }
      if (e.key === "Tab") {
        const controls = [...(editorRef.current?.querySelectorAll<HTMLElement>("a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex='0']") ?? [])]
          .filter(control => !control.closest("[hidden],[inert]") && control.tabIndex !== -1);
        const first = controls[0];
        const last = controls.at(-1);
        if (e.shiftKey && (t === first || t === editorRef.current)) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && t === last) { e.preventDefault(); first?.focus(); }
      }
      if (e.key === "Escape") {
        e.preventDefault(); e.stopImmediatePropagation();
        if (e.repeat) return;
        if (isCompact && precisionOpen) {
          finishPrecision();
        } else if (fullscreenRef.current || document.fullscreenElement === editorRef.current) {
          void document.exitFullscreen().catch(() => {});
        } else if (performance.now() >= escapeGuardUntil.current) close();
      }
      else if (e.key === "Enter" && !t.closest("button,[role='button'],input,select,textarea,[contenteditable]")) {
        e.preventDefault(); e.stopPropagation(); submit();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [close, submit, toggleFullscreen, settings, selectType, isCompact, precisionOpen, finishPrecision]);

  // Kahuna: each option's initial selects it (later duplicates win, as in Kahuna).
  const firstLetters = useMemo(() => [...new Set(settings.options.map((o) => o.key.charAt(0).toLowerCase()))], [settings]);
  useEffect(() => restrictShortcuts(firstLetters), [firstLetters]);
  const byLetter = (letter: string) => () => {
    const match = [...settings.options].reverse().find((o) => o.key.charAt(0).toLowerCase() === letter);
    if (match) selectType(match.key);
  };
  const canCrop = !creationReason && !!rect && !invalidCoordinates;
  const cropAction = (
    <button
      ref={cropActionRef}
      onClick={submit}
      disabled={!canCrop}
      title={creationReason}
      className={`group h-11 inline-flex items-center pl-1 pr-0 whitespace-nowrap ${canCrop ? "cursor-pointer" : "cursor-not-allowed"}`}
    >
      <span className={`h-8 inline-flex items-center gap-1.5 px-3 rounded transition-colors ${canCrop ? "bg-grid-accent text-white group-hover:bg-grid-accent-hover" : "bg-grid-accent/30 text-white/40"}`}>
        <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <path d="M6 2v16h16M2 6h16v16" />
        </svg>
        Crop
      </span>
    </button>
  );
  const effectivePanMode = panMode !== (desktop && isFullscreen && altHeld);
  const viewControls = (
    <div ref={viewControlsRef} className="w-22 shrink-0 flex items-center" role="group" aria-label="Image view">
      <button type="button" aria-label={zoomed ? "Fit image" : "Zoom in"} title={zoomed ? "Fit image" : "Zoom in"} className="size-11 shrink-0 flex items-center justify-center rounded text-grid-text-muted hover:bg-grid-hover cursor-pointer" onClick={() => { if (zoomed) canvasRef.current?.resetView(); else canvasRef.current?.zoomIn(); }}>
        <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <circle cx="10" cy="10" r="7" /><path d="m15 15 6 6M7 10h6" />
          {!zoomed && <path d="M10 7v6" />}
        </svg>
      </button>
      {(zoomed || (desktop && isFullscreen)) && <button type="button" aria-label="Pan view" title="Pan view" aria-pressed={effectivePanMode} className="group size-11 shrink-0 flex items-center justify-center cursor-pointer" onClick={() => setPanMode(current => !current)}>
        <span className={`size-8 flex items-center justify-center rounded ${effectivePanMode ? "bg-grid-accent text-white group-hover:bg-grid-accent-hover" : "text-grid-text-muted group-hover:bg-grid-hover"}`}><CropPanIcon className="size-5" /></span>
      </button>}
    </div>
  );
  const maskControl = showCircle && !isFullscreen ? (
    <label className={`${isCompact ? "min-h-11 shrink-0 gap-1.5 cursor-pointer whitespace-nowrap" : `absolute z-10 ${desktop ? "right-20" : "right-[26px]"} top-1 gap-1`} flex items-center text-xs text-grid-text-muted`}>
      <input
        type="checkbox"
        className={isCompact ? "size-4 shrink-0 accent-grid-accent" : undefined}
        checked={circularMask}
        onChange={event => {
          setCircularMask(event.target.checked);
          try { localStorage.setItem(CIRCULAR_MASK_KEY, String(event.target.checked)); } catch { /* ignore */ }
        }}
      />
      {isCompact ? "Apply mask" : "Apply circular mask"}
    </label>
  ) : null;
  const coordinates = (
    <div className={isCompact ? "grid grid-cols-2 gap-3" : "flex flex-wrap items-baseline gap-x-3 gap-y-2 py-1 min-w-0"} role="group" aria-label="Crop coordinates">
      {([["x", "y"], ["width", "height"]] as const).map(fields => (
        <div key={fields[0]} className={isCompact ? "contents" : "flex items-baseline gap-2"}>
          {fields.map(field => (
            <Fragment key={field}>
              {field === "height" && !isCompact && <span aria-hidden="true" className="text-grid-text-muted">×</span>}
              <CoordinateInput
                field={field}
                compact={isCompact}
                value={rect?.[field]}
                draft={inputDrafts[field]}
                invalid={invalidCoordinate(field)}
                min={coordinateLimits(field).min}
                max={coordinateLimits(field).max}
                onEdit={text => editCoordinate(field, text)}
                onDone={finishPrecision}
                onBlur={() => {
                  if (invalidCoordinate(field)) return;
                  setCoordinateDrafts(current => {
                    if (current?.owner !== owner) return current;
                    const values = { ...current.values };
                    delete values[field];
                    return { owner, values };
                  });
                }}
              />
            </Fragment>
          ))}
        </div>
      ))}
    </div>
  );
  const ratios = (
    <div role="radiogroup" aria-label="Crop ratio" className={`flex ${isCompact ? "flex-wrap w-full" : "border border-[#777]"}`}>
      {settings.options.map(o => (
        <button
          key={o.key}
          role="radio"
          aria-label={o.ratioString ? `${o.key} (${o.ratioString})` : o.key}
          aria-checked={o.key === option.key}
          title={`${o.key} [${o.key.charAt(0)}]`}
          onClick={() => selectType(o.key)}
          className={`grow border-l border-grid-separator first:border-l-0 capitalize text-center text-grid-text select-none cursor-pointer hover:bg-grid-hover hover:text-grid-text-bright ${isCompact ? "basis-0 min-w-11 min-h-11 px-1 py-1 text-xs wrap-anywhere" : "px-2.5 pt-[5px] pb-2 whitespace-nowrap"} ${o.key === option.key ? "bg-grid-hover shadow-[inset_0_-3px_0_var(--color-grid-accent)]" : "bg-[#444]"}`}
        >
          {!isCompact && <span className="hidden min-[1295px]:inline">{o.ratioString ? `${o.key} (${o.ratioString})` : o.key}</span>}
          <span className={isCompact ? undefined : "min-[1295px]:hidden"}>{o.ratioString ?? o.key}</span>
        </button>
      ))}
    </div>
  );
  return (
    <div ref={editorRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Crop image" onPointerDownCapture={isCompact ? event => { if (event.isPrimary === false && precisionDrag.current) cancelPrecisionDrag(); } : undefined} style={isCompact && !isFullscreen && viewport ? { top: viewport.top, height: viewport.height, bottom: "auto" } : undefined} className={`fixed inset-0 z-50 flex flex-col text-grid-text outline-none ${isFullscreen ? "bg-black" : "bg-grid-bg"}`} data-testid="crop-editor" data-keyboard-open={keyboardOpen || undefined}>
      {firstLetters.map((l) => <LetterShortcut key={l} letter={l} action={byLetter(l)} />)}
      <header hidden={isFullscreen} className={`crop-toolbar @container/detail-toolbar relative z-30 ${isFullscreen ? "hidden" : "flex"} items-center px-3 min-h-11 border-b border-grid-separator shrink-0 text-sm ${isCompact ? "h-11 gap-1" : "flex-wrap gap-x-3 gap-y-2"}`}>
        <DetailNavigation destination="image" onBack={close} onHome={onHome ? home : undefined} />
        {isCompact && !isFullscreen && <div className="crop-view-controls min-w-22 flex-1 flex justify-center">{viewControls}</div>}
        <div className="crop-toolbar-actions ml-auto flex flex-wrap items-center justify-end max-w-full">
          {!isCompact && <div className="mr-1 flex flex-wrap items-center justify-end gap-3 max-w-full">
            {coordinates}
            <div aria-hidden="true" className="w-px h-5 bg-grid-separator shrink-0" />
            {ratios}
          </div>}
          {cropAction}
          <div className="detail-settings shrink-0"><SettingsMenu /></div>
        </div>
      </header>
      {(creationReason || acceptedImage && ["pay", "overquota", "conditional"].includes(acceptedImage.cost)) && <div
        aria-label="Crop notices" className="shrink-0 border-b border-grid-separator bg-grid-bg px-3 py-1 text-sm flex flex-wrap items-center gap-x-4 gap-y-1 max-h-32 overflow-y-auto">
        {creationReason && <p role="status">{creationReason}</p>}
        {acceptedImage?.cost === "pay" && <p>Pay to use</p>}
        {acceptedImage?.cost === "overquota" && <p>Quota exceeded for this supplier</p>}
        {acceptedImage?.cost === "conditional" && <details>
          <summary className="cursor-pointer">Restricted use</summary>
          {acceptedImage.usageRights?.restrictions && <p className="whitespace-pre-wrap wrap-anywhere">{acceptedImage.usageRights.restrictions}</p>}
        </details>}
      </div>}
      <div ref={imageViewportRef} className={`relative flex-1 min-h-0 flex items-center justify-center overflow-hidden ${isFullscreen ? "px-10 pb-10 pt-[50px]" : isCompact ? "p-3" : "p-[26px]"}`}>
        {desktop && isFullscreen && <div className="absolute top-[6px] left-1/2 -translate-x-1/2 z-30 rounded bg-black/80">{viewControls}</div>}
        {isFullscreen && <div className="absolute top-[6px] right-4 z-20 flex items-center gap-1 text-sm">{cropAction}</div>}
        {desktop && !isFullscreen && <FullscreenCornerButton isFullscreen={false} onClick={toggleFullscreen} shortcut="Alt+f" revealed={touchControlsVisible} />}
        {!isCompact && maskControl}
        {!original || !src ? (
          <p className="text-grid-text-muted">This image cannot be cropped (no dimensions or preview).</p>
        ) : (
          <>
            <CropCanvas ref={canvasRef} key={image.id} src={src} zoomSrc={zoomSrc} zoomEnabled={desktop && isFullscreen} touchEnabled={isCompact && !isFullscreen} panMode={panMode} onZoomChange={onZoomChange} onAltChange={setAltHeld} alt={image.metadata?.title ?? ""} aspect={option.ratio} circle={circle} onChange={onSelection}
              initialSelection={draft?.cropKey === cropKey ? { rect: draft.rect, size: draft.size } : undefined} />
            {mediaStatus !== "ready" && (
              <p role="status" className="absolute text-grid-text-muted">
                {mediaStatus === "unavailable" ? "Image preview not available" : "Loading image..."}
              </p>
            )}
          </>
        )}
        <div className="absolute bottom-4 left-4 right-4 z-20 flex flex-col items-end gap-2 pointer-events-none">
          {panHint && isCompact && <ToastNotice category="success" message="Two-finger pan" icon={<CropPanIcon className="size-4 shrink-0 mt-px" />} onDismiss={() => setPanHint(false)} className="w-max max-w-full self-center pointer-events-none select-none" />}
          <SmallCropWarning key={image.id} width={rect?.width} cleared={state?.status === "ready" && state.selection === null} />
          {!creationReason && rect && !invalidCoordinates && dryRun && dryRun.state === canvasState && dryRun.source === sourceUri && dryRun.authority === acceptedImage && (
            <pre className="max-w-md p-3 text-xs bg-black/80 text-white rounded whitespace-pre-wrap pointer-events-auto" data-testid="crop-dry-run">
              {"Not sent — dry run\n"}{JSON.stringify(dryRun.request, null, 2)}
            </pre>
          )}
        </div>
      </div>
      {isCompact && !isFullscreen && <footer className={`shrink-0 bg-grid-bg ${precisionOpen ? "" : "border-t border-grid-separator"} ${keyboardOpen ? "pb-0" : "pb-[env(safe-area-inset-bottom)]"}`}>
        {precisionOpen && <section ref={precisionPanelRef} id={precisionId} data-testid="crop-coordinate-panel" style={{ maxHeight: keyboardOpen && viewport ? Math.max(128, viewport.height - 116) : (viewport?.height ?? window.innerHeight) / 2 }} onFocusCapture={revealCoordinate} className="relative z-10 overflow-y-auto overflow-x-hidden overscroll-contain bg-grid-bg rounded-t-2xl border-y border-grid-separator shadow-[0_-8px_24px_rgba(0,0,0,0.45)] px-4 pb-4">
          <div data-testid="crop-coordinate-handle" onPointerDown={startPrecisionDrag} onPointerMove={movePrecisionDrag} onPointerUp={endPrecisionDrag} onPointerCancel={cancelPrecisionDrag} onLostPointerCapture={() => { if (precisionDrag.current) cancelPrecisionDrag(); }} className="sticky top-0 z-10 bg-grid-bg flex items-center justify-between min-h-14 pt-3 touch-none select-none cursor-grab active:cursor-grabbing">
            <span aria-hidden="true" className="absolute top-2 left-1/2 -translate-x-1/2 h-1 w-10 rounded-full bg-grid-text-dim" />
            <h2 className="text-sm font-normal text-grid-text-bright">Coordinates</h2>
            <button type="button" aria-label="Done editing coordinates" title="Done" onClick={finishPrecision} className="size-11 flex items-center justify-center text-grid-text-muted hover:bg-grid-hover cursor-pointer">
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
            </button>
          </div>
          {coordinates}
        </section>}
        <div hidden={keyboardOpen}>{ratios}</div>
        <div hidden={keyboardOpen} className={`${keyboardOpen ? "hidden" : "flex"} items-center justify-between gap-3 border-t border-grid-separator px-3`}>
          <span className="min-w-0 text-xs text-grid-text-muted tabular-nums">{rect ? `${rect.width.toLocaleString()} × ${rect.height.toLocaleString()} px` : "— × — px"}</span>
          {maskControl}
          <button ref={precisionRef} type="button" aria-label="Edit crop coordinates" title="Edit crop coordinates" aria-expanded={precisionOpen} aria-controls={precisionOpen ? precisionId : undefined} onClick={() => { if (precisionOpen) finishPrecision(); else setPrecisionOpen(true); }} className="size-11 shrink-0 flex items-center justify-center text-grid-text-muted hover:bg-grid-hover cursor-pointer">
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 7h9m4 0h3M4 17h3m4 0h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></svg>
          </button>
        </div>
      </footer>}
    </div>
  );
}

function cropDepartureSignature(imageId: string, cropKey: string, rect: Rect | null, defaultRect: Rect,
  priorFrameEdits = false): string | null {
  return !priorFrameEdits && rect && (["x", "y", "width", "height"] as const).every(field => rect[field] === defaultRect[field])
    ? null : JSON.stringify([imageId, cropKey, rect]);
}

function useCropDepartureGuard(imageId: string, signature: string | null): () => boolean {
  const current = useRef(signature);
  const approved = useRef<string | null>(null);
  if (current.current !== signature) approved.current = null;
  current.current = signature;
  const confirmDeparture = useCallback(() => {
    const frame = current.current;
    if (frame === null || approved.current === frame) return true;
    if (!window.confirm("Abandon the adjusted crop? Leaving this editor will discard it.")) return false;
    approved.current = frame;
    return true;
  }, []);
  const shouldBlockFn = useCallback(({ next }: { next: { pathname: string; search: unknown } }) => {
    const search = next.search as { image?: string; cropping?: string };
    if (next.pathname === "/search" && search.image === imageId && search.cropping === "true") return false;
    return !confirmDeparture();
  }, [imageId, confirmDeparture]);
  // Reload restores the draft; deliberately do not register an unload warning.
  useBlocker({ shouldBlockFn, enableBeforeUnload: false });
  return confirmDeparture;
}

function SmallCropWarning({ width, cleared }: { width?: number; cleared: boolean }) {
  const [dismissed, setDismissed] = useState(false);
  const adequate = width !== undefined && width >= MIN_RECOMMENDED_CROP_WIDTH;
  useEffect(() => {
    if (adequate || cleared) setDismissed(false);
  }, [adequate, cleared]);
  if (width === undefined || adequate || dismissed) return null;
  return (
    <ToastNotice
      category="warning"
      className="w-max max-w-full pointer-events-none select-none"
      onDismiss={event => {
        if (document.activeElement === event.currentTarget) {
          event.currentTarget.closest<HTMLElement>('[role="dialog"]')?.focus({ preventScroll: true });
        }
        setDismissed(true);
      }}
      message={<>
        <span className="block">This crop is very small and will result in a low-quality image.</span>
        <span className="block">Please try to use a larger crop or an alternative image.</span>
      </>}
    />
  );
}

function CoordinateInput({ field, value, draft, invalid, min, max, onEdit, onBlur, onDone, compact = false }: {
  field: keyof Rect; value?: number; draft?: string; invalid: boolean; min: number; max: number; onEdit: (value: string) => void; onBlur: () => void; onDone: () => void; compact?: boolean;
}) {
  const inputId = useId();
  return (
    <label htmlFor={inputId} className={`${compact ? "flex flex-col min-w-0 gap-1" : "inline-flex items-baseline gap-1.5"} text-sm text-grid-text-muted whitespace-nowrap`}>
      {compact ? field === "width" ? "Width" : field === "height" ? "Height" : field.toUpperCase() : field === "width" ? "w" : field === "height" ? "h" : field}:
      <input
        id={inputId}
        name={`crop-${field}`}
        autoComplete="off"
        aria-label={`Crop ${field}`}
        title="Shift + Up/Down: 10 pixels"
        type="number"
        inputMode="numeric"
        enterKeyHint="done"
        aria-invalid={invalid || undefined}
        min={min}
        max={max}
        step={1}
        disabled={value === undefined}
        value={draft ?? value ?? ""}
        onChange={event => onEdit(event.target.value)}
        onBlur={onBlur}
        onKeyDown={event => {
          if (compact && event.key === "Enter" && !event.metaKey && !event.ctrlKey && !event.altKey) {
            event.preventDefault();
            onDone();
          } else if (event.shiftKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
            event.preventDefault();
            const next = Number(draft ?? value) + (event.key === "ArrowUp" ? 10 : -10);
            onEdit(String(Math.max(min, Math.min(max, next))));
          }
        }}
        className={`${compact ? "w-full min-h-11 text-base" : "w-[74px] text-sm"} ${invalid ? "border-grid-error outline-grid-error" : "border-grid-separator"} max-w-full border rounded-sm bg-grid-cell px-1.5 py-1 leading-5 text-grid-text tabular-nums disabled:opacity-50`}
      />
    </label>
  );
}

function useCropViewport(active: boolean, precisionOpen: boolean, editorRef: RefObject<HTMLDivElement | null>) {
  const [viewport, setViewport] = useState<{ height: number; top: number; keyboardOpen: boolean }>();
  const applied = useRef<typeof viewport>(undefined);
  const baseline = useRef({ height: window.innerHeight, width: window.innerWidth });
  useEffect(() => {
    const visible = window.visualViewport;
    const editor = editorRef.current;
    if (!active || !visible || !editor) return;
    let expansionTimer: ReturnType<typeof setTimeout> | undefined;
    const cancelExpansion = () => {
      if (expansionTimer !== undefined) clearTimeout(expansionTimer);
      expansionTimer = undefined;
    };
    const measure = (confirmedExpansion: boolean) => {
      if (Math.abs(visible.scale - 1) > 0.01) return;
      const focused = document.activeElement;
      const editing = focused instanceof HTMLInputElement && focused.type === "number" && editor.contains(focused);
      const previous = applied.current;
      const keyboardWasOpen = previous?.keyboardOpen ?? false;
      const widthChanged = visible.width !== baseline.current.width;
      if (widthChanged || (!editing && !keyboardWasOpen)) {
        baseline.current = { height: Math.max(window.innerHeight, visible.height), width: visible.width };
      }
      const keyboardOpen = precisionOpen && baseline.current.height - visible.height > 100 && (editing || keyboardWasOpen);
      const height = Math.round(visible.height);
      const top = Math.round(visible.offsetTop);
      if (!confirmedExpansion && !widthChanged && precisionOpen && keyboardWasOpen && previous
        && height + top > previous.height + previous.top + VIEWPORT_JITTER_PX) {
        expansionTimer = setTimeout(() => {
          expansionTimer = undefined;
          measure(true);
        }, KEYBOARD_EXPANSION_SETTLE_MS);
        return;
      }
      applied.current = { height, top, keyboardOpen };
      setViewport(current => current?.height === height && current.top === top && current.keyboardOpen === keyboardOpen
        ? current : { height, top, keyboardOpen });
    };
    const update = () => {
      cancelExpansion();
      measure(false);
    };
    update();
    visible.addEventListener("resize", update);
    visible.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    editor.addEventListener("focusin", update);
    editor.addEventListener("focusout", update);
    return () => {
      cancelExpansion();
      visible.removeEventListener("resize", update);
      visible.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      editor.removeEventListener("focusin", update);
      editor.removeEventListener("focusout", update);
    };
  }, [active, precisionOpen, editorRef]);
  return viewport;
}

function CropPanIcon({ className }: { className: string }) {
  return <svg data-icon="hand" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M8 12V6a1.5 1.5 0 0 1 3 0v5M11 6V4a1.5 1.5 0 0 1 3 0v7M14 6a1.5 1.5 0 0 1 3 0v6M17 10a1.5 1.5 0 0 1 3 0v6c0 4-2 6-6 6h-1c-2 0-3.5-1-4.5-2.5L4 13.5a1.6 1.6 0 0 1 2.5-2L8 13" />
  </svg>;
}

function LetterShortcut({ letter, action }: { letter: string; action: () => void }) {
  useKeyboardShortcut(letter, action);
  return null;
}
