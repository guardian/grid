import { createContext, useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { imageFullscreenElement } from "@/lib/app-fullscreen";
import { readEditingPreference, saveEditingPreference } from "@/lib/editing-preference";
import { readUploadPreference, saveUploadPreference } from "@/lib/upload-preference";

export const HiJoshuaContext = createContext(() => {});

export function HiJoshuaProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [allowEditing, setAllowEditing] = useState(false);
  const [allowUploads, setAllowUploads] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelTitle = useId();
  useFocusTrap(panelRef, open);

  const openPanel = useCallback(() => {
    setAllowEditing(readEditingPreference());
    setAllowUploads(readUploadPreference());
    setSaveError(false);
    setOpen(true);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || imageFullscreenElement()) return;
      if (event.key === "F12" && event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        event.stopPropagation();
        if (open) setOpen(false); else openPanel();
      } else if (open && event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      }
    };
    const onFullscreen = () => { if (imageFullscreenElement()) setOpen(false); };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
  }, [open, openPanel]);

  return <HiJoshuaContext value={openPanel}>
    {children}
    {open && createPortal(
      <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/50 p-3 sm:items-center"
        onPointerDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
        <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={panelTitle} tabIndex={-1}
          onKeyDown={event => { if (event.key !== "Tab") event.stopPropagation(); }}
          className="w-full max-w-sm max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded border border-grid-border bg-grid-bg p-4 text-grid-text shadow-lg outline-none">
          <div className="flex items-center justify-between gap-3 mb-5">
            <h2 id={panelTitle} className="text-base font-medium">Hello, Joshua</h2>
            <button onClick={() => setOpen(false)} aria-label="Close Hi, Joshua" title="Close"
              className="w-9 h-9 shrink-0 flex items-center justify-center rounded hover:bg-grid-hover">
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true"><path d="m18.3 5.7-1.4-1.4-4.9 4.9-4.9-4.9-1.4 1.4 4.9 4.9-4.9 4.9 1.4 1.4 4.9-4.9 4.9 4.9 1.4-1.4-4.9-4.9z" /></svg>
            </button>
          </div>
          <label className="flex items-center gap-3 py-3 text-sm cursor-pointer">
            <input type="checkbox" checked={allowEditing} onChange={event => setAllowEditing(event.target.checked)}
              className="w-4 h-4 rounded border-grid-border accent-grid-accent" />
            Allow editing
          </label>
          <label className="flex items-center gap-3 py-3 text-sm cursor-pointer">
            <input type="checkbox" checked={allowUploads} onChange={event => setAllowUploads(event.target.checked)}
              className="w-4 h-4 rounded border-grid-border accent-grid-accent" />
            Allow real uploads
          </label>
          {import.meta.env.VITE_USE_MEDIA_API !== "true" && <p className="text-sm text-grid-text-muted">Direct-ES mode is read-only.</p>}
          {saveError && <p role="alert" className="mt-3 text-sm">Could not save the preference.</p>}
          <div className="mt-5 flex justify-end">
            <button onClick={() => { if (saveEditingPreference(allowEditing) && saveUploadPreference(allowUploads)) window.location.reload(); else setSaveError(true); }}
              className="px-3 py-2 rounded text-sm bg-grid-accent text-white">Apply and reload</button>
          </div>
        </div>
      </div>, document.body,
    )}
  </HiJoshuaContext>;
}