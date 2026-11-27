import { useNavigate } from "@tanstack/react-router";
import { useBrowsingContext, useBrowsingSearch } from "@/lib/browsing-context";
import { useSearchStore } from "@/stores/search-store";
import { useUploadJobsStore } from "@/stores/upload-jobs-store";
import { getGridSessionIdentity } from "@/lib/grid-api-instance";
import { pushNavigate } from "@/lib/orchestration/search";
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type RefObject } from "react";
import { recordUploadFormInteraction, useUploadLayoutStore } from "@/stores/upload-layout-store";
import { UploadBatchSelector, UploadFilePrompt } from "./UploadActivity";
import { SearchFilters } from "./SearchFilters";
import { Chevron } from "./Chevron";
import { buildSearchKey } from "@/lib/image-offset-cache";
import { stopFollowingUploadBatch } from "@/lib/search-continuity";
import { addToast } from "@/stores/toast-store";
import { UPLOAD_SECTION_LABELS } from "@/lib/upload-section-layout";
import { isNativeInputTarget } from "@/lib/dom-utils";

function useUploadWarning(message: string | undefined, context?: string) {
  const previous = useRef<string | undefined>(undefined);
  useEffect(() => {
    const key = message ? `${context ?? ""}:${message}` : undefined;
    if (message && key !== previous.current) addToast({ category: "warning", message });
    previous.current = key;
  }, [message, context]);
}

function returnToSection(event: MouseEvent<HTMLElement>) {
  if ((event.target as Element).closest('button, select, input, textarea, a, [contenteditable], .upload-batch-selector, [aria-label="Batch sort"]')) return;
  event.currentTarget.querySelector<HTMLButtonElement>(".upload-section-jump")?.click();
}

function UploadSectionJump({ section, scrollRef, topOffset = 0 }: {
  section: "batch" | "other"; scrollRef: RefObject<HTMLDivElement | null>; topOffset?: number;
}) {
  const generation = useRef(0);
  const frame = useRef(0);
  const [unavailable, setUnavailable] = useState(false);
  const [passed, setPassed] = useState(false);
  const measurePosition = useRef<(() => void) | null>(null);
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    let scrollFrame = 0;
    const measure = () => {
      const track = container.querySelector<HTMLElement>(".upload-other-track");
      const boundary = track ? Math.max(0, track.offsetTop - useUploadLayoutStore.getState().chrome.batch - topOffset) : Infinity;
      const state = useSearchStore.getState();
      const afterBatch = state.bufferOffset - (state.uploadSections?.batch ?? 0);
      setPassed(section === "batch"
        ? state.bufferOffset > 0 && afterBatch >= 0 || container.scrollTop > 0 && container.scrollTop >= boundary
        : afterBatch > 0 || container.scrollTop > boundary + 1);
    };
    const onScroll = () => {
      if (!scrollFrame) scrollFrame = requestAnimationFrame(() => { scrollFrame = 0; measure(); });
    };
    measurePosition.current = onScroll;
    onScroll();
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      measurePosition.current = null;
      container.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(scrollFrame);
    };
  }, [section, scrollRef, topOffset]);
  useLayoutEffect(() => { measurePosition.current?.(); });
  useEffect(() => () => {
    if (generation.current) useUploadLayoutStore.getState().cancelNavigation(generation.current);
    cancelAnimationFrame(frame.current);
  }, []);
  const jump = () => {
    stopFollowingUploadBatch();
    const state = useSearchStore.getState();
    const target = Math.min(section === "batch" ? 0 : state.uploadSections?.batch ?? 0, Math.max(0, state.total - 1));
    const key = buildSearchKey(state.params);
    const token = useUploadLayoutStore.getState().beginNavigation();
    generation.current = token;
    setUnavailable(false);
    const place = () => {
      if (token !== useUploadLayoutStore.getState().navigationGeneration || key !== buildSearchKey(useSearchStore.getState().params)) return;
      const container = scrollRef.current;
      if (!container?.isConnected) return;
      const track = container.querySelector<HTMLElement>('[data-upload-section="other"]')?.parentElement;
      container.scrollTop = section === "batch" ? 0
        : Math.max(0, (track?.offsetTop ?? 0) - useUploadLayoutStore.getState().chrome.batch - topOffset);
    };
    if (!state.loading && (target >= state.bufferOffset && target < state.bufferOffset + state.results.length || !state.total)) place();
    else void state.seek(target, "upload-section-jump").then(() => {
      if (token !== useUploadLayoutStore.getState().navigationGeneration) return;
      const result = useSearchStore.getState();
      if (result.error || target < result.bufferOffset || target >= result.bufferOffset + result.results.length) {
        setUnavailable(true);
        return;
      }
      frame.current = requestAnimationFrame(place);
    }).catch(() => { if (token === useUploadLayoutStore.getState().navigationGeneration) setUnavailable(true); });
  };
  const label = section === "batch" ? "Go to start of current batch" : "Go to start of other uploads";
  return <button type="button" className={`upload-section-jump${unavailable ? " text-grid-error" : ""}`}
    aria-label={label} aria-description={unavailable ? "Section unavailable. Try again." : passed ? "Return to this section" : undefined}
    title={unavailable ? "Section unavailable. Try again." : label} onClick={jump}><Chevron direction={passed ? "right" : "down"} /></button>;
}

export function UploadPageChrome({ scrollRef, showIntro, topOffset = 0 }: {
  scrollRef: RefObject<HTMLDivElement | null>; showIntro: boolean; topOffset?: number;
}) {
  const { batch } = useBrowsingSearch();
  const chrome = useUploadLayoutStore(state => state.chrome);
  const introRef = useRef<HTMLDivElement>(null);
  const batchRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const onFocus = (event: FocusEvent) => {
      if ((event.target as Element).closest("[data-form-content]")) recordUploadFormInteraction();
      if ((event.target as Element).closest("[data-measured-cell]")) stopFollowingUploadBatch();
    };
    const onPointer = (event: PointerEvent) => {
      if ((event.target as Element).closest("[data-form-content]")) recordUploadFormInteraction();
      if (event.target === container) stopFollowingUploadBatch();
    };
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as Element).closest("[data-form-content]") &&
          (isNativeInputTarget(event) || !["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(event.key))) {
        recordUploadFormInteraction();
      }
    };
    container.addEventListener("focusin", onFocus);
    container.addEventListener("pointerdown", onPointer);
    container.addEventListener("keydown", onKey);
    return () => {
      container.removeEventListener("focusin", onFocus);
      container.removeEventListener("pointerdown", onPointer);
      container.removeEventListener("keydown", onKey);
    };
  }, [scrollRef]);
  useLayoutEffect(() => {
    const measure = () => useUploadLayoutStore.getState().setChrome(
      introRef.current ? Math.ceil(introRef.current.getBoundingClientRect().height) : useUploadLayoutStore.getState().chrome.intro,
      Math.ceil(batchRef.current?.getBoundingClientRect().height ?? 0));
    measure();
    const observer = new ResizeObserver(measure);
    if (introRef.current) observer.observe(introRef.current);
    if (batchRef.current) observer.observe(batchRef.current);
    return () => observer.disconnect();
  }, [showIntro]);
  return <>
    {showIntro && <div className="absolute inset-x-0" style={{ top: topOffset }}>
      <div ref={introRef} className="upload-page-intro flow-root sticky left-0 leading-normal" style={{ width: "100cqw", maxWidth: "100%" }}><UploadFilePrompt /></div>
    </div>}
    <div className="upload-batch-track absolute inset-x-0 bottom-0 pointer-events-none" style={{ top: topOffset + (showIntro ? chrome.intro : 0) }}>
      <div ref={batchRef} className="upload-batch-sticky sticky left-0 pointer-events-auto bg-grid-bg leading-normal" style={{ top: topOffset, width: "100cqw", maxWidth: "100%" }}>
        <section aria-label="Current batch" className="upload-page-controls text-grid-text cursor-pointer" onClick={returnToSection}>
          <div className="upload-batch-heading">
            <UploadSectionJump section="batch" scrollRef={scrollRef} topOffset={topOffset} />
            <h2 className="hidden wide:block">{UPLOAD_SECTION_LABELS.batch}</h2>
            <UploadBatchSelector batch={batch} />
            <UploadBatchStatus />
          </div>
          {batch && <div role="group" aria-label="Batch sort" className="flex shrink-0 items-center gap-1"><span className="text-xs hidden wide:inline">Batch sort</span><SearchFilters.Sort alwaysVisible /></div>}
        </section>
      </div>
    </div>
  </>;
}

export function UploadBatchStatus() {
  const { batch } = useBrowsingSearch();
  const { recentUploadScope } = useBrowsingContext();
  const record = useUploadJobsStore(state => state.batches.find(item => item.id === batch));
  const error = useSearchStore(state => !state.loading && recentUploadScope
    && state.params.recentUploadScope?.key === recentUploadScope.key ? state.uploadSections?.batchError : undefined);
  const message = !batch ? undefined : error ?? (!record && !recentUploadScope?.batch?.revision ? "This local batch is unavailable in this tab." : undefined);
  useUploadWarning(message, batch);
  return null;
}

export function UploadSectionHeading({ section, top, scrollRef, topOffset = 0 }: {
  section: "batch" | "other"; top: number; scrollRef: RefObject<HTMLDivElement | null>; topOffset?: number;
}) {
  const { recentStatus, recentUploadScope } = useBrowsingContext();
  const counts = useSearchStore(state => state.uploadSections);
  const navigate = useNavigate();
  const [linkError, setLinkError] = useState(false);
  const chrome = useUploadLayoutStore(state => state.chrome);
  const headerRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const measure = () => { if (headerRef.current) useUploadLayoutStore.getState().setOther(Math.ceil(headerRef.current.getBoundingClientRect().height)); };
    measure();
    const observer = new ResizeObserver(measure);
    if (headerRef.current) observer.observe(headerRef.current);
    return () => observer.disconnect();
  }, []);
  const unavailable = useSearchStore(state => !state.loading && recentUploadScope
    && state.params.recentUploadScope?.key === recentUploadScope.key ? state.uploadSections?.otherError : undefined);
  const warning = linkError ? "Your uploads are unavailable. Reload after signing in." : unavailable;
  useUploadWarning(warning, recentUploadScope?.key);
  const message = recentStatus === "loading" ? "Loading my other uploads..." : undefined;
  return <div className="upload-other-track absolute inset-x-0 bottom-0 pointer-events-none" style={{ top }}>
    <section ref={headerRef} data-upload-section={section} aria-label="My other uploads"
    className="sticky left-0 pointer-events-auto bg-grid-bg text-grid-text leading-normal upload-other-heading cursor-pointer"
    onClick={returnToSection}
    style={{ top: topOffset + chrome.batch, width: "100cqw", maxWidth: "100%" }}>
    <div className="upload-other-heading-content">
    <div className="upload-other-heading-row flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
      <UploadSectionJump section="other" scrollRef={scrollRef} topOffset={topOffset} />
      <h2 className="font-normal"><span className="hidden wide:inline">{UPLOAD_SECTION_LABELS.other}</span><span className="wide:hidden">Other uploads</span></h2>
      {!message && !warning && <span className="text-xs text-grid-text-muted" aria-label={`${counts?.other ?? 0} images`}>{(counts?.other ?? 0).toLocaleString()}<span className="hidden wide:inline"> matches, newest first</span></span>}
      {recentUploadScope?.uploadedBy && <button type="button" aria-label="View all your uploads" title="View all your uploads" className="upload-other-search ml-auto shrink-0 underline cursor-pointer" onClick={async () => {
        const identity = await getGridSessionIdentity();
        if (!identity) { setLinkError(true); return; }
        pushNavigate(navigate, { to: "/search", search: { uploadedBy: identity, nonFree: "true", orderBy: "-uploadTime" } });
      }}><svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg><span className="hidden wide:inline">View all your uploads</span></button>}
    </div>
    {message && <p role="status" className="text-xs text-grid-text-muted wrap-anywhere mt-1">{message}</p>}
    </div>
    </section>
  </div>;
}