import { afterEach, describe, expect, it, vi } from "vitest";
import { describeImageAction, prepareImageAction, selectionImageActionContext, type ImageActionContext, type ImageActionTarget } from "./image-actions";
import { attachEnrichment, useEnrichmentStore } from "@/stores/enrichment-store";
import { _resetMetadataCache, useSelectionStore } from "@/stores/selection-store";
import { useSearchStore } from "@/stores/search-store";
import { stampImageRead } from "./image-read-freshness";
import { useImageActionStore } from "@/stores/image-action-store";
import { applyLegacyCropParams } from "./crop/crop-options";
import { useToastStore } from "@/stores/toast-store";

const session = vi.hoisted(() => ({ invalidated: false }));
vi.mock("./grid-api-instance", () => ({ isGridSessionInvalidated: () => session.invalidated }));
afterEach(() => { session.invalidated = false; useToastStore.getState()._clearAll(); });

function target(id: string): ImageActionTarget {
  return { id, image: { id, uploadTime: "", uploadedBy: "", metadata: {}, exports: [],
    source: { mimeType: "image/jpeg", dimensions: { width: 1200, height: 800 } }, userMetadata: { archived: false } },
  overlay: { valid: true, persisted: { value: false, reasons: [] }, actions: [{ name: "delete", href: `https://api.example.test/images/${id}`, method: "DELETE" }],
    resource: { uri: `https://api.example.test/images/${id}`, links: [
      { rel: "crops", href: `https://crop.example.test/crops/${id}` },
      { rel: "download", href: `https://api.example.test/images/${id}/download` },
    ] } } };
}

const context = (...targets: ImageActionTarget[]): ImageActionContext => ({ targets, api: true, archive: true });

describe("image action preparation", () => {
  it("blocks full-frame preparation under an incoming mandatory ratio without blocking defaults", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("sessionStorage", { getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
    try {
      applyLegacyCropParams(new URLSearchParams("defaultCropType=video"));
      expect(prepareImageAction("full-frame", context(target("ready")))).toBeDefined();
      applyLegacyCropParams(new URLSearchParams("cropType=video"));
      expect(prepareImageAction("full-frame", context(target("ready")))).toBeUndefined();
      expect(describeImageAction("full-frame", context(target("ready"))).reason).toContain("requested crop ratio");
    } finally { vi.unstubAllGlobals(); }
  });
  it("bounds disconnected history without reusing retained preview identities", () => {
    const initial = useImageActionStore.getState();
    try {
      useImageActionStore.setState({ prepared: [] });
      for (let index = 0; index < 25; index++) {
        expect(useImageActionStore.getState().prepare("share", context({ id: `preview-${index}` }))).toBe(true);
      }
      const previews = useImageActionStore.getState().prepared;
      expect(previews).toHaveLength(20);
      expect(previews[0].targetIds).toEqual(["preview-5"]);
      expect(new Set(previews.map(preview => preview.previewId)).size).toBe(20);
    } finally { useImageActionStore.setState(initial, true); }
  });

  it("uses refreshed resident crop information while retaining off-buffer selection metadata", () => {
    const selection = useSelectionStore.getState();
    const search = useSearchStore.getState();
    const enrichment = useEnrichmentStore.getState();
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    try {
      const cached = target("selected");
      const fresh = target("selected");
      fresh.image!.exports = [{ specification: { type: "full" } }];
      stampImageRead(cached.image!, cached.overlay, 1, "lean");
      stampImageRead(fresh.image!, fresh.overlay, 2, "lean");
      attachEnrichment(cached.image!, cached.overlay!);
      attachEnrichment(fresh.image!, fresh.overlay!);
      _resetMetadataCache();
      useSelectionStore.getState().metadataCache.set("selected", cached.image!);
      useSelectionStore.setState({ selectedIds: new Set(["selected"]), pendingFetchIds: new Set(), isRangeWalking: false });
      useSearchStore.setState({ results: [fresh.image!], imagePositions: new Map([["selected", 0]]), bufferOffset: 0 });
      useEnrichmentStore.setState({ data: new Map([["selected", fresh.overlay!]]) });
      expect(describeImageAction("full-frame", selectionImageActionContext(true)).reason).toBe("Already has a full frame");
      const offscreen = target("offscreen");
      stampImageRead(offscreen.image!, offscreen.overlay, 1, "lean");
      attachEnrichment(offscreen.image!, offscreen.overlay!);
      useSelectionStore.getState().metadataCache.set("offscreen", offscreen.image!);
      useSelectionStore.setState({ selectedIds: new Set(["selected", "offscreen"]) });
      expect(prepareImageAction("full-frame", selectionImageActionContext(true))?.eligibleIds).toEqual(["offscreen"]);
    } finally {
      useSelectionStore.setState(selection, true);
      useSearchStore.setState(search, true);
      useEnrichmentStore.setState(enrichment, true);
      vi.unstubAllEnvs();
    }
  });

  it("skips existing full frames and denied images while capturing the complete selection", () => {
    const existing = target("existing");
    existing.image!.exports = [{ specification: { type: "full" } }];
    const covering = target("covering");
    covering.image!.exports = [{ specification: { type: "crop", bounds: { x: 0, y: 0, width: 1200, height: 800 } } }];
    const denied = target("denied");
    denied.overlay!.resource!.links = [];
    const invalid = target("invalid");
    invalid.overlay!.valid = false;
    const ready = target("ready");
    const targets = context(existing, covering, denied, invalid, ready);
    const prepared = prepareImageAction("full-frame", targets)!;
    expect(prepared.targetIds).toEqual(["existing", "covering", "denied", "invalid", "ready"]);
    expect(prepared.eligibleIds).toEqual(["ready"]);
    expect(prepared.skipped).toEqual([
      { id: "existing", reason: "Already has a full frame" }, { id: "covering", reason: "Already has a full frame" },
      { id: "denied", reason: "Cannot crop this image" },
      { id: "invalid", reason: "Cannot crop this image" },
    ]);
    expect(prepared.commands).toEqual([{ imageId: "ready", method: "POST", resource: "crop", body: { type: "full", source: "https://api.example.test/images/ready" } }]);
    useImageActionStore.getState().prepare("full-frame", targets);
    expect(useToastStore.getState().queue.at(-1)?.message).toBe("4 images won't be cropped");
    ready.overlay!.resource!.uri = "https://changed.example.test/";
    expect(prepared.commands[0].body).toEqual({ type: "full", source: "https://api.example.test/images/ready" });
  });

  it("distinguishes unknown crop information from an image with no full frame", () => {
    const unknown = target("unknown");
    unknown.image!.exports = undefined;
    expect(prepareImageAction("full-frame", context(target("ready"), unknown))).toBeUndefined();
    expect(describeImageAction("full-frame", context(unknown)).reason).toBe("Crop information is not ready");
  });

  it("skips known unavailable full-frame targets instead of blocking ready images", () => {
    const gone = target("gone");
    gone.image!.__availability = "unavailable";
    gone.overlay = undefined;
    gone.pending = true;
    expect(prepareImageAction("full-frame", context(target("ready"), gone))).toMatchObject({
      eligibleIds: ["ready"], skipped: [{ id: "gone", reason: "Image unavailable" }],
    });
  });

  it("uses plain single-image skip wording and retains counts for batches", () => {
    const existing = target("existing");
    existing.image!.exports = [{ specification: { type: "full" } }];
    expect(describeImageAction("full-frame", context(existing)).reason).toBe("Already has a full frame");
    const second = target("second");
    second.image!.exports = [{ specification: { type: "full" } }];
    expect(describeImageAction("full-frame", context(existing, second)).reason).toBe("2: Already has a full frame");
  });

  it("describes single-image denials without implying an underlying selection", () => {
    const denied = target("denied");
    denied.overlay!.actions = [];
    denied.overlay!.resource!.links = [];
    expect(describeImageAction("delete", context(denied)).reason).toBe("This image cannot be deleted");
    expect(describeImageAction("delete", context(target("ready"), denied)).reason).toBe("Not all selected images can be deleted");
    expect(describeImageAction("download", context(denied)).reason).toBe("This image is not available to download");
    expect(describeImageAction("download", context(target("ready"), denied)).reason).toBe("Not all selected images are available to download");
    denied.image!.__availability = "deleted";
    expect(describeImageAction("delete", context(denied)).reason).toBe("This image is unavailable or deleted");
    expect(describeImageAction("delete", context(target("ready"), denied)).reason).toBe("One or more selected images are unavailable or deleted");
  });

  it("rejects cached service authority after session invalidation but still prepares Share", () => {
    session.invalidated = true;
    const current = context(target("ready"));
    expect(prepareImageAction("delete", current)).toBeUndefined();
    expect(describeImageAction("library", current).reason).toBe("Reload after signing in again");
    expect(prepareImageAction("share", current)?.targetIds).toEqual(["ready"]);
  });

  it("matches Library mixed-state behaviour without changing unrelated retention reasons", () => {
    const archived = target("archived");
    archived.image!.userMetadata!.archived = true;
    archived.overlay!.persisted = { value: true, reasons: ["archived"] };
    const kept = target("kept");
    kept.overlay!.persisted = { value: true, reasons: ["usages"] };
    expect(prepareImageAction("library", context(archived, kept, target("new")))!).toMatchObject({ operation: "archive", eligibleIds: ["kept", "new"] });
    expect(prepareImageAction("library", context(archived, kept))!).toMatchObject({ operation: "unarchive", eligibleIds: ["archived"] });
    expect(describeImageAction("library", context(kept))).toMatchObject({ label: "Kept in Library", eligibleIds: [] });
    expect(describeImageAction("library", context(kept)).reason).toBe("Kept in Library because the image has been used.");
    expect(prepareImageAction("library", { ...context(archived), archive: false })).toBeUndefined();
  });

  it("captures Share IDs without requiring image metadata and blocks incomplete service targets", () => {
    const targets: ImageActionTarget[] = [{ id: "first" }, { id: "second" }];
    const prepared = prepareImageAction("share", context(...targets))!;
    targets.splice(0, 1);
    expect(prepared.targetIds).toEqual(["first", "second"]);
    expect(prepared.sharePath).toBe("/search?nonFree=true&ids=first%2Csecond");
    expect(prepareImageAction("delete", context(...targets))).toBeUndefined();
    expect(prepareImageAction("share", { ...context(...targets), pending: true })).toBeUndefined();
  });
});