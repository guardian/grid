import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useImageActionStore, type ImageActionPreview } from "@/stores/image-action-store";
import { useIsCompact } from "@/hooks/useShell";
import { containPillActivation } from "./SearchPill";

export function ImageActivityFrame({ inline, hidden, labelCount, draftCount, revision, children }: {
  inline: boolean; hidden: boolean; labelCount: number; draftCount: number; revision: number; children: ReactNode;
}) {
  const prepared = useImageActionStore(state => state.prepared);
  const actionRevision = useImageActionStore(state => state.revision);
  const compact = useIsCompact();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (detailsRef.current && (labelCount > 0 || prepared.length > 0 && (!compact || inline))) detailsRef.current.open = true;
  }, [revision, actionRevision, labelCount, prepared.length, compact, inline]);
  const dismiss = (preview: ImageActionPreview, button: HTMLButtonElement) => {
    const buttons = [...detailsRef.current!.querySelectorAll<HTMLButtonElement>("[data-dismiss-preview]")];
    const index = buttons.indexOf(button);
    const panelCloses = prepared.length === 1 && !labelCount && !draftCount;
    const destination = panelCloses ? preview.returnFocus?.deref() : buttons[index + 1] ?? buttons[index - 1] ?? summaryRef.current;
    useImageActionStore.getState().dismiss(preview.previewId);
    if (destination?.isConnected && !destination.matches(":disabled") && !destination.closest("[inert]") && getComputedStyle(destination).visibility !== "hidden") {
      destination.focus({ preventScroll: true });
    }
    if (!destination || document.activeElement !== destination) {
      const fallback = [...document.querySelectorAll<HTMLElement>('.detail-toolbar button:not([disabled]), [role="toolbar"] a[href]')]
        .find(element => !element.closest("[inert]") && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden");
      fallback?.focus({ preventScroll: true });
    }
  };
  if (hidden || (!labelCount && !draftCount && !prepared.length)) return null;
  const label = prepared.length ? "Image activity" : "Label activity";
  return <aside aria-label={label} onKeyDown={containPillActivation}
    className={`${inline ? "m-3" : "image-activity fixed bottom-4 left-4 z-[120] w-80 max-w-[calc(100vw-2rem)]"} rounded bg-black/90 text-white shadow-lg`}>
    <details ref={detailsRef} open={labelCount > 0 || prepared.length > 0 && (!compact || inline)}>
      <summary ref={summaryRef} tabIndex={0} className="px-3 py-2 cursor-pointer text-xs">{label} ({labelCount + prepared.length})</summary>
      <div className="max-h-[30dvh] overflow-auto overscroll-contain px-3 pb-3 space-y-3">
        {children}
        {[...prepared].reverse().map(intent => <div key={intent.previewId} className="text-xs">
          <div className="flex items-start justify-between gap-2">
            <p role="status">Not sent - {intent.label}</p>
            <button type="button" data-dismiss-preview aria-label={`Dismiss ${intent.label} preview`} title="Dismiss preview"
              onClick={event => dismiss(intent, event.currentTarget)}
              className="flex size-6 pointer-coarse:size-9 shrink-0 items-center justify-center hover:bg-grid-hover cursor-pointer">
              <svg className="size-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m6 4 6 6 6-6 2 2-6 6 6 6-2 2-6-6-6 6-2-2 6-6-6-6 2-2Z" /></svg>
            </button>
          </div>
          <p>{intent.targetIds.length} {intent.targetIds.length === 1 ? "image" : "images"}; {intent.eligibleIds.length} prepared{intent.skipped.length ? `; ${intent.skipped.length} skipped` : ""}.</p>
          {intent.skipped.length > 0 && <p>{[...new Set(intent.skipped.map(item => item.reason))].map(reason => `${intent.skipped.filter(item => item.reason === reason).length}: ${reason}`).join("; ")}</p>}
          <details><summary className="cursor-pointer">Details</summary><pre className="whitespace-pre-wrap wrap-anywhere">{JSON.stringify({ operation: intent.operation,
            targets: intent.targetIds.slice(0, 8), additionalTargets: Math.max(0, intent.targetIds.length - 8),
            ...(intent.operation === "share" ? { action: "Copy link" } : { commands: intent.commands.slice(0, 8).map(command => ({ imageId: command.imageId,
              method: command.method, resource: command.resource, ...(command.body && { body: { ...command.body, ...(command.body.source && { source: "[image resource]" }) } }) })) }),
          }, null, 2)}</pre></details>
        </div>)}
      </div>
    </details>
  </aside>;
}