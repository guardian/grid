import { useNavigate } from "@tanstack/react-router";
import { useBrowsingContext, useBrowsingSearch } from "@/lib/browsing-context";
import { useSearchStore } from "@/stores/search-store";
import { useUploadJobsStore } from "@/stores/upload-jobs-store";
import { getGridSessionIdentity } from "@/lib/grid-api-instance";
import { pushNavigate } from "@/lib/orchestration/search";
import { useState } from "react";
import { UPLOAD_SECTION_HEIGHT } from "@/lib/upload-section-layout";
import { useVisibleRange } from "@/hooks/useDataWindow";
import { isTwoTierFromTotal } from "@/lib/two-tier";

export function UploadOrientation() {
  const range = useVisibleRange();
  const sections = useSearchStore(state => state.uploadSections);
  const offset = useSearchStore(state => isTwoTierFromTotal(state.total) ? 0 : state.bufferOffset);
  const { batch } = useBrowsingSearch();
  const name = useUploadJobsStore(state => state.batches.find(item => item.id === batch)?.attempts[0]?.name);
  const upper = !!batch && range.start + offset < (sections?.batch ?? 0);
  return <span role="status" data-upload-active-section={upper ? "batch" : "other"} className="px-2 flex items-center gap-2 text-xs whitespace-nowrap">
    <span className="max-w-44 truncate">{upper ? name ?? "Open batch" : "My other uploads"}</span>
    <span>{upper && sections?.batchError || !upper && sections?.otherError ? "Unavailable" : `${(upper ? sections?.batch ?? 0 : sections?.other ?? 0).toLocaleString()} images`}</span>
  </span>;
}

export function UploadSectionHeading({ section, top }: { section: "batch" | "other"; top: number }) {
  const { batch } = useBrowsingSearch();
  const { recentStatus, recentUploadScope } = useBrowsingContext();
  const record = useUploadJobsStore(state => state.batches.find(item => item.id === batch));
  const counts = useSearchStore(state => state.uploadSections);
  const navigate = useNavigate();
  const [linkError, setLinkError] = useState(false);
  const upper = section === "batch";
  const unavailable = upper ? counts?.batchError : counts?.otherError;
  return <div className="absolute inset-x-0" style={{ top, height: UPLOAD_SECTION_HEIGHT }}>
    <section data-upload-section={section} aria-label={upper ? "Open batch" : "My other uploads"}
    className="sticky left-0 px-3 py-2 bg-grid-bg border-y border-grid-separator text-grid-text leading-normal"
    style={{ width: "100cqw", maxWidth: "100%", height: UPLOAD_SECTION_HEIGHT }}>
    <div className="flex items-center gap-3 min-w-0">
      <h2 className="text-sm font-semibold truncate">{upper ? record?.attempts[0]?.name ?? "Open batch" : "My other uploads"}</h2>
      {!upper && recentUploadScope?.uploadedBy && <button type="button" className="ml-auto shrink-0 text-xs underline cursor-pointer" onClick={async () => {
        const identity = await getGridSessionIdentity();
        if (!identity) { setLinkError(true); return; }
        pushNavigate(navigate, { to: "/search", search: { uploadedBy: identity, nonFree: "true", orderBy: "-uploadTime" } });
      }}>View all your uploads</button>}
    </div>
    <p role={unavailable || linkError ? "status" : undefined} className="text-xs text-grid-text-muted wrap-anywhere mt-1">
      {upper ? unavailable ?? (!record && !recentUploadScope?.batch?.revision ? "This local batch is unavailable in this tab."
        : !recentUploadScope?.batch?.ids.length ? "This batch has no available images yet." : `${record?.attempts.length ?? recentUploadScope.batch.ids.length} files / ${recentUploadScope.batch.ids.length} unique images / ${counts?.batch ?? 0} available`)
        : recentStatus === "loading" ? "Loading my other uploads..." : linkError ? "Your uploads are unavailable. Reload after signing in." : unavailable ?? `${(counts?.other ?? 0).toLocaleString()} images / newest first`}
    </p>
    </section>
  </div>;
}