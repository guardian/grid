/**
 * Crop editor — dry run. Rendered by ImageDetail when `cropping=true`.
 *
 * Builds Kahuna's cropper-service request and shows it; nothing is sent.
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Image } from "@/types/image";
import { DetailNavigation } from "@/components/DetailNavigation";
import { FullscreenCornerButton } from "@/components/NavStrip";
import { ToastNotice } from "@/components/ToastContainer";
import { getFullImageUrl, getThumbnailUrl, getZoomImageUrl } from "@/lib/image-urls";
import { getCropSettings, getCropSettingsRevision, subscribeCropSettings, SQUARE_KEY, type CropOption } from "@/lib/crop/crop-options";
import { flushCropDraft, queueCropDraft, readCropDraft } from "@/lib/crop/crop-draft";
import { gridConfig } from "@/lib/grid-config";
import {
  buildCropRequest, editCropRect, isValidCropRect, MIN_RECOMMENDED_CROP_WIDTH, originalCropSize, toOriginalRect,
  type CropRequest, type Rect,
} from "@/lib/crop/crop-request";
import { serviceLink } from "@/lib/grid-api-instance";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";
import { restrictShortcuts } from "@/lib/keyboard-shortcuts";
import { CropCanvas, type CropCanvasHandle, type CropCanvasState } from "./CropCanvas";

const CIRCULAR_MASK_KEY = "kupua.crop.circularMask";

function initialCircularMask(): boolean {
  try {
    return localStorage.getItem(CIRCULAR_MASK_KEY) !== "false";
  } catch {
    return true;
  }
}

interface CropEditorProps {
  image: Image;
  previewSrc?: string;
  onClose: () => void;
  onHome?: () => void;
}

export function CropEditor({ image, previewSrc, onClose, onHome }: CropEditorProps) {
  const revision = useSyncExternalStore(subscribeCropSettings, getCropSettingsRevision);
  const settings = useMemo(() => getCropSettings(), [revision]);
  const original = originalCropSize(image);
  const draft = useMemo(() => readCropDraft(image.id, original, settings),
    [image.id, original?.width, original?.height, settings]);
  const initialType = draft?.cropKey ?? settings.initialType;
  const [choice, setChoice] = useState({ revision, imageId: image.id, key: initialType });
  const [selectionRevision, setSelectionRevision] = useState(0);
  const cropKey = choice.revision === revision && choice.imageId === image.id ? choice.key : initialType;
  const editorRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<CropCanvasHandle>(null);
  const [desktop, setDesktop] = useState(() => window.matchMedia?.("(hover: hover) and (pointer: fine)").matches ?? false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fullscreenRef = useRef(false);
  const escapeGuardUntil = useRef(0);
  useEffect(() => {
    const media = window.matchMedia?.("(hover: hover) and (pointer: fine)");
    const change = () => setDesktop(media?.matches ?? false);
    media?.addEventListener("change", change);
    return () => media?.removeEventListener("change", change);
  }, []);
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
    let live = true;
    void serviceLink("image").then((href) => { if (live) setSourceTemplate(href); });
    return () => { live = false; };
  }, []);

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

  const owner = useMemo(() => ({}), [image.id, src, cropKey, revision, selectionRevision, original?.width, original?.height]);
  const currentOwner = useRef(owner);
  currentOwner.current = owner;
  const [canvasState, setCanvasState] = useState<{ owner: object; value: CropCanvasState }>();
  const [dryRun, setDryRun] = useState<{ state: typeof canvasState; sourceTemplate?: string; request: CropRequest }>();
  const state = canvasState?.owner === owner ? canvasState.value : undefined;
  const rect = original && state?.status === "ready" && state.selection
    && isValidCropRect(state.selection, state.rendition)
    ? toOriginalRect(state.selection, state.rendition, original, cropKey) : undefined;
  const onSelection = useCallback((value: CropCanvasState) => {
    if (currentOwner.current !== owner) return;
    setCanvasState({ owner, value });
    if (original && value.status === "ready" && (value.selection === null || isValidCropRect(value.selection, value.rendition))) {
      queueCropDraft({ version: 1, imageId: image.id, size: original, cropKey, ratio: option.ratio,
        rect: value.selection === null ? null : toOriginalRect(value.selection, value.rendition, original, cropKey) });
    }
  }, [owner]);

  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === "hidden") flushCropDraft(); };
    window.addEventListener("pagehide", flushCropDraft);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flushCropDraft);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const editCoordinate = (field: keyof Rect, value: number) => {
    if (rect && original) canvasRef.current?.setSelection(editCropRect(rect, field, value, original, option.ratio), original);
  };

  const selectType = useCallback((key: string) => {
    if (!settings.options.some((o) => o.key === key)) return;
    if (key === cropKey && state?.status === "ready" && !state.selection) {
      setSelectionRevision(value => value + 1);
    } else setChoice({ revision, imageId: image.id, key });
  }, [settings, revision, image.id, cropKey, state]);

  const submit = useCallback(() => {
    if (!rect || !original || !isValidCropRect(rect, original)) return;
    const source = sourceTemplate?.replace("{id}", encodeURIComponent(image.id)) ?? `<media-api>/images/${image.id}`;
    const request = buildCropRequest(source, rect, option);
    setDryRun({ state: canvasState, sourceTemplate, request });
    console.info("[crop dry run] POST cropper `crop` link", request);
  }, [rect, original, sourceTemplate, image.id, option, canvasState]);

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
          .filter(control => !control.closest("[hidden]") && control.tabIndex !== -1);
        const first = controls[0];
        const last = controls.at(-1);
        if (e.shiftKey && (t === first || t === editorRef.current)) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && t === last) { e.preventDefault(); first?.focus(); }
      }
      if (e.key === "Escape") {
        e.preventDefault(); e.stopImmediatePropagation();
        if (e.repeat) return;
        if (fullscreenRef.current || document.fullscreenElement === editorRef.current) {
          void document.exitFullscreen().catch(() => {});
        } else if (performance.now() >= escapeGuardUntil.current) onClose();
      }
      else if (e.key === "Enter" && !t.closest("button,[role='button'],input,select,textarea,[contenteditable]")) {
        e.preventDefault(); e.stopPropagation(); submit();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, submit, toggleFullscreen, settings, selectType]);

  // Kahuna: each option's initial selects it (later duplicates win, as in Kahuna).
  const firstLetters = useMemo(() => [...new Set(settings.options.map((o) => o.key.charAt(0).toLowerCase()))], [settings]);
  useEffect(() => restrictShortcuts(firstLetters), [firstLetters]);
  const byLetter = (letter: string) => () => {
    const match = [...settings.options].reverse().find((o) => o.key.charAt(0).toLowerCase() === letter);
    if (match) selectType(match.key);
  };
  const cropAction = (
    <button
      onClick={submit}
      disabled={!rect}
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-sm bg-grid-accent text-white disabled:opacity-50 cursor-pointer whitespace-nowrap"
    >
      <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d="M6 2v16h16M2 6h16v16" />
      </svg>
      Crop (dry run)
    </button>
  );
  return (
    <div ref={editorRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Crop image" className={`fixed inset-0 z-50 flex flex-col text-grid-text outline-none ${isFullscreen ? "bg-black" : "bg-grid-bg"}`} data-testid="crop-editor">
      {firstLetters.map((l) => <LetterShortcut key={l} letter={l} action={byLetter(l)} />)}
      <header hidden={isFullscreen} className={`${isFullscreen ? "hidden" : "flex"} flex-wrap items-center gap-x-3 gap-y-2 px-3 pb-2 sm:pb-0 min-h-11 border-b border-grid-separator shrink-0 text-sm`}>
        <DetailNavigation destination="image" onBack={onClose} onHome={onHome} />
        <div className="ml-auto flex flex-wrap items-center justify-end gap-3 max-w-full">
          <div className="flex items-center gap-3 max-w-full">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2 py-1 min-w-0" role="group" aria-label="Crop coordinates">
              {([["x", "y"], ["width", "height"]] as const).map(fields => (
                <div key={fields[0]} className="flex items-baseline gap-2">
                  {fields.map(field => (
                    <Fragment key={field}>
                      {field === "height" && <span aria-hidden="true" className="text-grid-text-muted">&times;</span>}
                      <CoordinateInput
                        field={field}
                        value={rect?.[field]}
                        min={field === "x" || field === "y" ? 0 : 1}
                        max={original ? field === "x" ? original.width - (rect?.width ?? 0)
                          : field === "y" ? original.height - (rect?.height ?? 0)
                          : field === "width" ? original.width - (rect?.x ?? 0) : original.height - (rect?.y ?? 0) : 0}
                        onEdit={value => editCoordinate(field, value)}
                      />
                    </Fragment>
                  ))}
                </div>
              ))}
            </div>
            <div aria-hidden="true" className="w-px h-5 bg-grid-separator shrink-0" />
          </div>
          <div role="radiogroup" aria-label="Crop ratio" className="flex border border-[#777]">
            {settings.options.map((o) => (
              <button
                key={o.key}
                role="radio"
                aria-label={o.ratioString ? `${o.key} (${o.ratioString})` : o.key}
                aria-checked={o.key === option.key}
                title={`${o.key} [${o.key.charAt(0)}]`}
                onClick={() => selectType(o.key)}
                className={`grow px-2.5 pt-[5px] pb-2 border-l border-l-[#777] first:border-l-0 capitalize text-center text-grid-text whitespace-nowrap select-none cursor-pointer hover:bg-grid-hover hover:text-grid-text-bright ${o.key === option.key ? "bg-grid-hover shadow-[inset_0_-3px_0_var(--color-grid-accent)]" : "bg-[#444]"}`}
              >
                <span className="hidden min-[1295px]:inline">{o.ratioString ? `${o.key} (${o.ratioString})` : o.key}</span>
                <span className="min-[1295px]:hidden">{o.ratioString ?? o.key}</span>
              </button>
            ))}
          </div>
          {!isFullscreen && cropAction}
        </div>
      </header>
      <div className={`relative flex-1 min-h-0 flex items-center justify-center overflow-hidden ${isFullscreen ? "px-10 pb-10 pt-[50px]" : "p-[26px]"}`}>
        {isFullscreen && <div className="absolute top-[6px] right-4 z-20 text-sm">{cropAction}</div>}
        {desktop && !isFullscreen && <FullscreenCornerButton isFullscreen={false} onClick={toggleFullscreen} shortcut="Alt+f" />}
        {showCircle && !isFullscreen && (
          <label className={`absolute z-10 ${desktop ? "right-20" : "right-[26px]"} top-1 flex items-center gap-1 text-xs text-grid-text-muted`}>
            <input
              type="checkbox"
              checked={circularMask}
              onChange={(e) => {
                setCircularMask(e.target.checked);
                try { localStorage.setItem(CIRCULAR_MASK_KEY, String(e.target.checked)); } catch { /* ignore */ }
              }}
            />
            Apply circular mask
          </label>
        )}
        {!original || !src ? (
          <p className="text-grid-text-muted">This image cannot be cropped (no dimensions or preview).</p>
        ) : (
          <>
            <CropCanvas ref={canvasRef} key={image.id} src={src} zoomSrc={zoomSrc} zoomEnabled={desktop && isFullscreen} alt={image.metadata?.title ?? ""} aspect={option.ratio} circle={circle} onChange={onSelection}
              initialSelection={draft?.cropKey === cropKey ? { rect: draft.rect, size: draft.size } : undefined} />
            {state?.status !== "ready" && (
              <p role="status" className="absolute text-grid-text-muted">
                {state?.status === "unavailable" ? "Image preview not available" : "Loading image..."}
              </p>
            )}
          </>
        )}
        <div className="absolute bottom-4 left-4 right-4 z-20 flex flex-col items-end gap-2 pointer-events-none">
          <SmallCropWarning key={image.id} width={rect?.width} cleared={state?.status === "ready" && state.selection === null} />
          {rect && dryRun && dryRun.state === canvasState && dryRun.sourceTemplate === sourceTemplate && (
            <pre className="max-w-md p-3 text-xs bg-black/80 text-white rounded whitespace-pre-wrap pointer-events-auto" data-testid="crop-dry-run">
              {"Not sent — dry run\n"}{JSON.stringify(dryRun.request, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
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

function CoordinateInput({ field, value, min, max, onEdit }: {
  field: keyof Rect; value?: number; min: number; max: number; onEdit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string>();
  return (
    <label className="inline-flex items-baseline gap-1.5 text-sm text-grid-text-muted whitespace-nowrap">
      {field === "width" ? "w" : field === "height" ? "h" : field}:
      <input
        aria-label={`Crop ${field}`}
        title="Shift + Up/Down: 10 pixels"
        type="number"
        min={min}
        max={max}
        step={1}
        disabled={value === undefined}
        value={draft ?? value ?? ""}
        onChange={event => {
          setDraft(event.target.value);
          if (event.target.value !== "") onEdit(event.target.valueAsNumber);
        }}
        onBlur={() => setDraft(undefined)}
        onKeyDown={event => {
          if (event.shiftKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
            event.preventDefault();
            const next = Number(draft ?? value) + (event.key === "ArrowUp" ? 10 : -10);
            setDraft(undefined);
            onEdit(Math.max(min, Math.min(max, next)));
          }
        }}
        className="w-[74px] max-w-full border border-grid-separator rounded-sm bg-grid-cell px-1.5 py-1 text-sm leading-5 text-grid-text tabular-nums disabled:opacity-50"
      />
    </label>
  );
}

function LetterShortcut({ letter, action }: { letter: string; action: () => void }) {
  useKeyboardShortcut(letter, action);
  return null;
}
