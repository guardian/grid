/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockDataSource } from "@/dal/mock-data-source";
import { RECONCILE_FIELDS } from "@/lib/field-registry";
import { recomputeAll } from "@/lib/reconcile";
import { gridConfig } from "@/lib/grid-config";
import { BrowsingContext } from "@/lib/browsing-context";
import { LOCATION_COMPONENTS, MetadataLocationEditor } from "./MetadataLocationEditor";
import type { Image } from "@/types/image";
import { MultiImageMetadata } from "./MultiImageMetadata";
import { FORM_METADATA_FIELDS, ImageMetadata } from "./ImageMetadata";
import { EditLifecycle, LabelEditor, LabelEditorContext, SelectedEditStatus } from "./LabelEditor";
import { useSelectionStore } from "@/stores/selection-store";
import { useCollectionStore } from "@/stores/collection-store";
import { useSearchStore } from "@/stores/search-store";
import { createLabelEditorStore, labelTargetKey } from "@/stores/label-editor-store";
import { BATCH_POLICY, createBatchQueue } from "@/lib/batch-execution";
import { nextEditSequence } from "@/lib/metadata-edit-execution";
import { MetadataFormField, MetadataTextEditor } from "./MetadataTextEditor";
import { DetailsDrafts } from "./DetailsDrafts";
import { FormBatchContext, MetadataBatchArrow, MetadataEditorContext, SelectionSaveIndicator } from "./MetadataEditing";
import { useMetadataDrafts } from "@/stores/metadata-drafts-store";
import { useToastStore } from "@/stores/toast-store";
import { createMetadataEditorStore, metadataIntent, type MetadataSave } from "@/stores/metadata-editor-store";
import { MetadataSuggestionInput } from "./MetadataSuggestionInput";
import { CostBadge, CostBadgeFromCost } from "./CostBadge";
import { useUsageRightsCatalogue } from "@/lib/usage-rights-catalogue";
import * as typeahead from "@/lib/typeahead-fields";
import * as gridSession from "@/lib/grid-api-instance";
import type { GridCommandResult, LabelCommand } from "@/lib/grid-commands";
import { acceptEnrichedImage, attachEnrichment, useEnrichmentStore } from "@/stores/enrichment-store";
import { acceptImageOverlay, acceptObservedImages, admitLabelObservation, captureImageRead, getMetadataWriteWitness, recordImageAvailability, resetImageFreshnessForTests, stampImageRead } from "@/lib/image-read-freshness";

const fixture = vi.hoisted(() => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })));
  return { updateSearch: vi.fn(), cancelDebounce: vi.fn(), reveal: vi.fn() };
});
vi.mock("@tanstack/react-router", () => ({ useSearch: () => ({ query: "credit:Reuters" }) }));
vi.mock("@/hooks/useUrlSearchSync", () => ({ useUpdateSearchParams: () => fixture.updateSearch }));
vi.mock("@/lib/orchestration/search", () => ({ cancelSearchDebounce: fixture.cancelDebounce, scrollFocusedIntoView: fixture.reveal }));

const partialKeywords = Array.from({ length: 25 }, (_, i) => `partial-${i}`);
const configuredImageTypes = [...gridConfig.imageTypes];
let images: Image[];
let frames: FrameRequestCallback[];

function fieldRow(label: string) {
  return screen.getByText(label, { selector: "dt" }).parentElement!;
}

beforeEach(async () => {
  useToastStore.getState()._clearAll();
  useMetadataDrafts.setState({ drafts: new Map() });
  resetImageFreshnessForTests();
  vi.clearAllMocks();
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
  const base = await new MockDataSource(2).getByIds(["img-0", "img-1"]);
  images = base.map((image, i) => ({
    ...image,
    metadata: { ...image.metadata, keywords: i === 0 ? [...partialKeywords, "shared"] : ["shared"] },
  }));
  useEnrichmentStore.getState().setEnrichment(new Map(images.map(image => [image.id, {
    resource: { links: [{ rel: "edits", href: `https://metadata.example.test/metadata/${image.id}` }] },
    actions: [{ name: "add-collection", method: "POST", href: `/collections/images/${image.id}` }],
  }])));
});
afterEach(() => {
  cleanup();
  gridConfig.imageTypes.splice(0, gridConfig.imageTypes.length, ...configuredImageTypes);
  vi.unstubAllEnvs();
  useEnrichmentStore.getState().setEnrichment(new Map());
  useUsageRightsCatalogue.setState({ categories: null });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("multi-image cost summary", () => {
  it("uses Unknown for missing rights across summaries, detail and badges", () => {
    const unknown = images.map(image => ({ ...image, usageRights: { category: "" } }));
    render(<><MultiImageMetadata images={unknown} reconciledView={recomputeAll(unknown, RECONCILE_FIELDS)} total={2} />
      <ImageMetadata image={unknown[0]} overlay={{ valid: false, invalidReasons: { no_rights: "Custom rights notice" } }} /><CostBadgeFromCost noRights cost="pay" size="md" />
      <CostBadge variant="no-rights" tooltip="Specific warning" /></>);
    expect(screen.getByText("2 Unknown")).toBeTruthy();
    expect(screen.queryByText("Custom rights notice")).not.toBeNull();
    expect(screen.queryByText("None")).toBeNull();
    act(() => useUsageRightsCatalogue.setState({ categories: [{ value: "", name: "Unspecified rights" }] }));
    expect(screen.getByText("2 Unknown")).toBeTruthy();
    expect(screen.getAllByText("Unknown").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByTitle("Unknown")).toBeTruthy();
    expect(screen.getByTitle("Specific warning")).toBeTruthy();
  });

  it("uses server cost read with selected images, below the current search's overlay", () => {
    const [a, b] = images.map((image) => ({ ...image, usageRights: { category: "staff-photographer" } }));
    attachEnrichment(a, { cost: "overquota" });
    attachEnrichment(b, { cost: "free" });
    useEnrichmentStore.getState().setEnrichment(new Map([[b.id, { cost: "conditional" }]]));
    render(<MultiImageMetadata images={[a, b]} reconciledView={recomputeAll([a, b], RECONCILE_FIELDS)} total={2} />);
    expect(screen.getByText("1 over quota")).toBeTruthy();
    expect(screen.getByText("1 restricted")).toBeTruthy();
    expect(screen.queryByText(/free/)).toBeNull();
  });
});

describe("metadata field preparation", () => {
  it("retains submitted Credit alongside selection progress without an inline receipt ledger", () => {
    vi.useFakeTimers();
    const editor = createMetadataEditorStore(vi.fn(), { readImages: vi.fn(), publishImages: vi.fn() });
    const field = RECONCILE_FIELDS.find(field => field.id === "metadata_credit")!;
    const targets = images.map(image => image.id);
    try {
      render(<MetadataEditorContext value={editor}><dl><MetadataTextEditor field={field} targetIds={targets} value="Old">Old</MetadataTextEditor></dl>
        <SelectionSaveIndicator targetKey={labelTargetKey(targets)} /><EditLifecycle /></MetadataEditorContext>);
      fireEvent.click(screen.getByRole("button", { name: "Edit Credit" }));
      fireEvent.change(screen.getByLabelText("Credit", { selector: "input" }), { target: { value: "Desk" } });
      fireEvent.click(screen.getByRole("button", { name: "Commit Credit" }));
      expect([...editor.getState().saves.values()].map(save => save.intent.targetIds)).toEqual([targets]);
      expect((screen.getByLabelText("Credit", { selector: "input" }) as HTMLInputElement).value).toBe("Desk");
      expect(within(fieldRow("Credit")).queryByRole("button", { name: "Saving Credit" })).toBeNull();
      expect(screen.getByRole("button", { name: "Commit Credit" }).matches(":disabled")).toBe(true);
      expect(within(fieldRow("Credit")).queryByText(/Queued:|Saving:|Finished:/)).toBeNull();
      expect(screen.queryByRole("complementary", { name: "Image activity" })).toBeNull();
      expect(screen.queryByRole("progressbar", { name: "Updating selected images" })).toBeNull();
      expect(window.dispatchEvent(new Event("beforeunload", { cancelable: true }))).toBe(false);
      act(() => vi.advanceTimersByTime(1500));
      expect(within(fieldRow("Credit")).getByRole("button", { name: "Saving Credit" })).toBeTruthy();
      const meter = screen.getByRole("progressbar", { name: "Updating selected images" });
      expect(meter.textContent).toBe("Updating Credit: 0/2");
      const save = [...editor.getState().saves.values()][0];
      act(() => editor.setState({ saves: new Map([[save.id, { ...save, items: [
        { imageId: targets[0], state: "unchanged", observation: "observed" },
        { imageId: targets[1], state: "accepted-awaiting-visibility", observation: "pending" },
      ] }]]) }));
      expect(meter.textContent).toBe("Updating Credit: 1/2");
      expect(meter.getAttribute("aria-valuetext")).toBe("1 of 2 confirmed");
      expect(meter.querySelector("button")).toBeNull();
      expect(screen.queryByRole("button", { name: /Stop remaining/ })).toBeNull();
      act(() => editor.getState().stop(save.id));
      expect(window.dispatchEvent(new Event("beforeunload", { cancelable: true }))).toBe(true);
      expect(screen.queryByRole("progressbar", { name: "Updating selected images" })).toBeNull();
      expect((screen.getByLabelText("Credit", { selector: "input" }) as HTMLInputElement).value).toBe("Desk");
      fireEvent.click(within(fieldRow("Credit")).getByRole("button", { name: "Credit not confirmed" }));
      fireEvent.click(within(fieldRow("Credit")).getByRole("button", { name: "Dismiss" }));
      const retained = screen.getByLabelText("Credit", { selector: "input" }) as HTMLInputElement;
      expect(retained.matches(":disabled")).toBe(false);
      expect(retained.value).toBe("Desk");
      expect(editor.getState().saves.size).toBe(1);
    } finally { editor.getState().dispose(); vi.useRealTimers(); }
  });

  it("shows progress independently for both accepted batch arrows while they wait", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const editor = createMetadataEditorStore(vi.fn(), { readImages: vi.fn(), publishImages: vi.fn() });
    render(<MetadataEditorContext value={editor}>
      <EditLifecycle />
      <FormBatchContext value={{ key: "batch", ids: ["source", "peer"] }}>
        <MetadataBatchArrow imageId="source" fieldId="metadata_credit" label="Credit" value="" disabled={false} />
        <MetadataBatchArrow imageId="source" fieldId="metadata_byline" label="Byline" value="Author" disabled={false} />
      </FormBatchContext>
    </MetadataEditorContext>);
    try {
      fireEvent.click(screen.getByRole("button", { name: "Clear Credit on 1 other image" }));
      expect(confirm).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Apply Byline to 1 other image" }));
      expect(window.dispatchEvent(new Event("beforeunload", { cancelable: true }))).toBe(false);
      for (const label of ["Credit", "Byline"]) {
        const progress = screen.getByRole("button", { name: `Applying ${label} to 1 other image` });
        expect(progress.querySelector("circle")).toBeNull();
        expect(progress.getAttribute("title")).toBe(`Applying ${label} to 1 other image`);
      }
      expect(screen.queryByRole("button", { name: "Stop batch save" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Applying Credit to 1 other image" }));
      expect(screen.queryByRole("button", { name: "Stop batch save" })).toBeNull();
      expect(screen.getByRole("button", { name: "Applying Credit to 1 other image" }).getAttribute("aria-expanded")).toBe("true");
    } finally { confirm.mockRestore(); editor.getState().dispose(); }
  });

  it("opens uncertain batch arrow details without replay when the value was observed", async () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    vi.useFakeTimers();
    const execute = vi.fn().mockResolvedValue({ outcome: "unknown", expected: { credit: "Desk" } });
    const editor = createMetadataEditorStore(execute, {
      readImages: async () => {
        const image = { ...images[0], metadata: { credit: "Desk" }, userMetadata: { lastModified: new Date(Date.now()).toISOString() } };
        const overlay = { resource: { links: [{ rel: "edits", href: `https://metadata.example.test/metadata/${image.id}` }] } };
        stampImageRead(image, overlay, captureImageRead(), "lean"); attachEnrichment(image, overlay);
        return [image];
      }, publishImages: vi.fn(),
    });
    try {
      render(<MetadataEditorContext value={editor}>
        <FormBatchContext value={{ key: "batch", ids: ["source", images[0].id] }}>
          <MetadataBatchArrow imageId="source" fieldId="metadata_credit" label="Credit" value="Desk" disabled={false} />
        </FormBatchContext>
      </MetadataEditorContext>);
      fireEvent.click(screen.getByRole("button", { name: "Apply Credit to 1 other image" }));
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      expect([...editor.getState().saves.values()][0]).toMatchObject({ state: "finished", items: [{ state: "unknown", observation: "observed" }] });
      fireEvent.click(screen.getByRole("button", { name: "Credit edit needs attention" }));
      expect(screen.getByText("Credit not confirmed on 1 other image.")).toBeTruthy();
      expect(editor.getState().saves.size).toBe(1);
      expect(execute).toHaveBeenCalledOnce();
    } finally { editor.getState().dispose(); vi.useRealTimers(); }
  });

  it("invalidates collection counts for a partial removal when observation fails without replay", async () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    vi.useFakeTimers();
    const paths = ["news", "sport"];
    const image = { ...images[0], collections: paths.map(pathId => ({ pathId, path: [pathId] })) };
    attachEnrichment(image, { resource: { links: [] }, removableCollections: new Set(paths) });
    const result = { outcome: "partial", expected: { collections: ["sport"] }, labelSteps: { acknowledged: 1, rejected: 1, uncertain: 0, notSent: 0 } } as const;
    const execute = vi.fn().mockResolvedValue(result);
    const editor = createMetadataEditorStore(execute, {
      readImages: vi.fn().mockResolvedValueOnce([image]).mockRejectedValue(new Error("Observation unavailable")), publishImages: vi.fn(),
    });
    const revision = useCollectionStore.getState().countRevision;
    try {
      const id = editor.getState().submit({ fieldId: "collections", action: "remove", value: paths, targetIds: [image.id] })!;
      await vi.runAllTimersAsync();
      expect(editor.getState().saves.get(id)).toMatchObject({ state: "finished", items: [{ observation: "unavailable", result }] });
      expect(execute).toHaveBeenCalledOnce();
      expect(useCollectionStore.getState().countRevision).toBe(revision + 1);
    } finally { editor.getState().dispose(); vi.useRealTimers(); }
  });

  it("bounds retained confirmations and disposes held reads without starting more work", async () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    vi.useFakeTimers();
    const ids = [images[0].id, images[1].id, "third-save"];
    const written = new Set<string>();
    const releases = new Map<string, () => void>();
    const aborted: string[] = [];
    const execute = vi.fn(async (command: { imageId: string }): Promise<GridCommandResult> => {
      written.add(command.imageId);
      return { outcome: "acknowledged", expected: { credit: command.imageId }, metadataWitness: command.imageId };
    });
    const readImages = vi.fn(async (requested: string[], signal: AbortSignal) => {
      const result = requested.map(id => {
        const image = { ...images[0], id, metadata: { credit: written.has(id) ? id : "Before" },
          userMetadata: { lastModified: written.has(id) ? "2026-11-19T12:00:01Z" : "2026-11-19T12:00:00Z" } };
        const overlay = { resource: { links: [{ rel: "edits", href: `https://metadata.example.test/metadata/${id}` }] } };
        stampImageRead(image, overlay, captureImageRead(), "lean"); attachEnrichment(image, overlay);
        return image;
      });
      const id = requested[0];
      if (!written.has(id)) return result;
      return new Promise<Image[]>((resolve, reject) => {
        const abort = () => { aborted.push(id); reject(new DOMException("Stopped", "AbortError")); };
        signal.addEventListener("abort", abort, { once: true });
        releases.set(id, () => { signal.removeEventListener("abort", abort); resolve(result); });
      });
    });
    const editor = createMetadataEditorStore(execute, { readImages, publishImages: vi.fn() });
    try {
      const saves: number[] = [];
      for (const id of ids) {
        saves.push(editor.getState().submit({ fieldId: "metadata_credit", action: "overwrite", value: id, targetIds: [id] })!);
        await vi.advanceTimersByTimeAsync(0);
      }
      expect(execute.mock.calls.map(([command]) => command.imageId)).toEqual(ids.slice(0, 2));
      expect(editor.getState().saves.get(saves[2])?.state).toBe("queued");
      releases.get(ids[0])!();
      await vi.advanceTimersByTimeAsync(0);
      expect(execute.mock.calls.map(([command]) => command.imageId)).toEqual(ids);
      expect(editor.getState().saves.get(saves[0])?.items).toMatchObject([{ observation: "observed" }]);
      const reads = readImages.mock.calls.length;
      editor.getState().dispose();
      await vi.advanceTimersByTimeAsync(30_000);
      expect(aborted).toEqual(ids.slice(1));
      expect(readImages).toHaveBeenCalledTimes(reads);
      expect(execute).toHaveBeenCalledTimes(3);
    } finally { editor.getState().dispose(); for (const release of releases.values()) release(); vi.useRealTimers(); }
  });

  it("observes first edits of newly uploaded images while queued targets are displayed", async () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    vi.useFakeTimers();
    const descriptions = new Map<string, string>();
    let visible = false;
    const readImages = vi.fn(async (ids: string[]) => ids.map(id => {
      const description = visible ? descriptions.get(id) : undefined;
      const image = { ...images[0], id, metadata: description ? { description } : {},
        userMetadata: description ? { lastModified: "2026-11-18T12:00:00Z" } : {} };
      const overlay = { resource: { links: [{ rel: "edits", href: `https://metadata.example.test/metadata/${id}` }] } };
      stampImageRead(image, overlay, captureImageRead(), "lean");
      attachEnrichment(image, overlay);
      return image;
    }));
    const execute = vi.fn(async (command: { imageId: string; value?: unknown }): Promise<GridCommandResult> => {
      if (!descriptions.size) {
        for (const image of await readImages(images.map(image => image.id))) acceptEnrichedImage(image);
      }
      descriptions.set(command.imageId, String(command.value));
      return { outcome: "acknowledged", expected: { description: String(command.value) } };
    });
    const publishImages = vi.fn();
    const editor = createMetadataEditorStore(execute, { readImages, publishImages });
    try {
      for (const image of images) editor.getState().submit({ fieldId: "metadata_description", action: "if-empty",
        value: `Uploaded ${image.id}`, targetIds: [image.id] });
      await vi.advanceTimersByTimeAsync(BATCH_POLICY.speed.startIntervalMs * 2);
      expect(execute.mock.calls.map(([command]) => command.imageId)).toEqual(images.map(image => image.id));
      expect(publishImages).not.toHaveBeenCalled();
      visible = true;
      await vi.advanceTimersByTimeAsync(30_000);
      expect(execute.mock.calls.map(([command]) => command.imageId)).toEqual(images.map(image => image.id));
      expect([...editor.getState().saves.values()].map(save => ({ state: save.state, excluded: save.excluded,
        outcomes: save.items.map(item => item.observation) }))).toEqual(images.map(() => ({ state: "finished", excluded: 0,
        outcomes: ["observed"] })));
      expect(publishImages.mock.calls.flatMap(([published]) => published.map((image: Image) => image.id)))
        .toEqual(images.map(image => image.id));
      expect(readImages.mock.calls.some(([ids]) => ids.length === images.length)).toBe(true);
    } finally { editor.getState().dispose(); vi.useRealTimers(); }
  });

  it("stops only one grouped save and keeps an uncertain same-image successor unsent", async () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    vi.useFakeTimers();
    const ids = [images[0].id, images[1].id, "independent-upload", "stopped-before-start"];
    const values = new Map<string, string>();
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const execute = vi.fn(async (command: { imageId: string; value?: unknown }): Promise<GridCommandResult> => {
      await held;
      values.set(command.imageId, String(command.value));
      return { outcome: command.imageId === ids[0] ? "unknown" : "acknowledged", expected: { description: String(command.value) } };
    });
    const editor = createMetadataEditorStore(execute, {
      readImages: async requested => requested.map(id => {
        const image = { ...images[0], id, metadata: { description: values.get(id) ?? "" },
          userMetadata: values.has(id) ? { lastModified: "2026-11-18T12:00:00Z" } : {} };
        const overlay = { resource: { links: [{ rel: "edits", href: `https://metadata.example.test/metadata/${id}` }] } };
        stampImageRead(image, overlay, captureImageRead(), "lean"); attachEnrichment(image, overlay);
        return image;
      }), publishImages: vi.fn(),
    });
    try {
      const saves = ids.map(id => editor.getState().submit({ fieldId: "metadata_description", action: "overwrite",
        value: `Value ${id}`, targetIds: [id] })!);
      const successor = editor.getState().submit({ fieldId: "metadata_description", action: "overwrite",
        value: "Later value", targetIds: [ids[0]] })!;
      await vi.advanceTimersByTimeAsync(0);
      editor.getState().stop(saves[3]);
      await vi.advanceTimersByTimeAsync(BATCH_POLICY.speed.startIntervalMs * 2);
      expect(execute.mock.calls.map(([command]) => command.imageId)).toEqual(ids.slice(0, 3));
      expect(editor.getState().saves.get(successor)?.state).toBe("queued");
      release();
      await vi.advanceTimersByTimeAsync(30_000);
      expect(editor.getState().saves.get(saves[0])?.items).toMatchObject([{ state: "unknown", observation: "observed" }]);
      expect(editor.getState().saves.get(saves[3])?.items).toMatchObject([{ state: "stopped" }]);
      expect(editor.getState().saves.get(saves[2])?.items).toMatchObject([{ result: { outcome: "acknowledged" }, observation: "observed" }]);
      expect(editor.getState().saves.get(successor)?.message).toBe("Not sent: conflict");
      expect(execute).toHaveBeenCalledTimes(3);
    } finally { release(); editor.getState().dispose(); vi.useRealTimers(); }
  });

  it("replaces an unsent Form revision after its group starts", async () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    vi.useFakeTimers();
    const values = new Map<string, string>();
    const blockers = [images[0].id, "blocking-second", "blocking-third"];
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const execute = vi.fn(async (command: { imageId: string; value?: unknown }): Promise<GridCommandResult> => {
      if (blockers.includes(command.imageId)) await held;
      values.set(command.imageId, String(command.value));
      return { outcome: "acknowledged", expected: { credit: String(command.value) } };
    });
    const editor = createMetadataEditorStore(execute, {
      readImages: async ids => ids.map(id => {
        const image = { ...images[0], id, metadata: { credit: values.get(id) ?? "" },
          userMetadata: values.has(id) ? { lastModified: "2026-11-18T12:00:00Z" } : {} };
        const overlay = { resource: { links: [{ rel: "edits", href: `https://metadata.example.test/metadata/${id}` }] } };
        stampImageRead(image, overlay, captureImageRead(), "lean"); attachEnrichment(image, overlay);
        return image;
      }), publishImages: vi.fn(),
    });
    try {
      for (const imageId of blockers) editor.getState().submit({ fieldId: "metadata_credit", action: "overwrite", value: "First image", targetIds: [imageId] });
      useMetadataDrafts.getState().setDraft(images[1].id, "metadata_credit", "", "Obsolete");
      editor.getState().flush(images[1].id, "metadata_credit");
      await vi.advanceTimersByTimeAsync(0);
      useMetadataDrafts.getState().setDraft(images[1].id, "metadata_credit", "", "Latest");
      editor.getState().flush(images[1].id, "metadata_credit");
      release();
      await vi.advanceTimersByTimeAsync(30_000);
      expect(execute.mock.calls.map(([command]) => [command.imageId, command.value]))
        .toEqual([...blockers.map(imageId => [imageId, "First image"]), [images[1].id, "Latest"]]);
      expect(useMetadataDrafts.getState().drafts.size).toBe(0);
    } finally { release(); editor.getState().dispose(); vi.useRealTimers(); }
  });

  it.each(["unavailable", "reload-required", "readback"] as const)("scopes a grouped %s failure without replay", async reason => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    vi.useFakeTimers();
    const ids = [images[0].id, images[1].id, "third-active", "unsent-after-session-loss"];
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const execute = vi.fn(async (command: { imageId: string }): Promise<GridCommandResult> => {
      if (reason === "readback" && command.imageId !== ids[0]) await held;
      return command.imageId === ids[0] && reason !== "readback"
        ? { outcome: "blocked", reason } : { outcome: "unchanged", expected: { credit: "Ready" } };
    });
    const editor = createMetadataEditorStore(execute, {
      readImages: async ids => {
        if (reason === "readback" && ids.length === 1 && ids[0] === images[0].id) throw new Error("Readback unavailable");
        return ids.map(id => {
          const image = { ...images[0], id, metadata: { credit: "Ready" } };
          const overlay = { resource: { links: [{ rel: "edits", href: `https://metadata.example.test/metadata/${id}` }] } };
          stampImageRead(image, overlay, captureImageRead(), "lean"); attachEnrichment(image, overlay);
          return image;
        });
      }, publishImages: vi.fn(),
    });
    try {
      const saves = ids.map(imageId => editor.getState().submit({ fieldId: "metadata_credit", action: "overwrite",
        value: "Ready", targetIds: [imageId] })!);
      await vi.advanceTimersByTimeAsync(0);
      release();
      await vi.advanceTimersByTimeAsync(30_000);
      expect(execute.mock.calls.map(([command]) => command.imageId)).toEqual(reason !== "reload-required" ? ids : ids.slice(0, 3));
      expect(editor.getState().saves.get(saves[0])?.items[0]).toMatchObject(reason === "readback"
        ? { result: { outcome: "unchanged" }, observation: "unavailable" } : { result: { outcome: "blocked", reason } });
      expect(editor.getState().saves.get(saves[3])?.items[0]).toMatchObject(reason !== "reload-required"
        ? { state: "unchanged", observation: "observed" } : { state: "stopped" });
    } finally { release(); editor.getState().dispose(); vi.useRealTimers(); }
  });

  it("keeps an uncertain Form receipt and draft without resubmitting the same revision on blur", async () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    vi.useFakeTimers();
    const execute = vi.fn().mockResolvedValue({ outcome: "unknown", expected: { credit: "Uncertain credit" } });
    const editor = createMetadataEditorStore(execute, {
      readImages: async () => {
        const image = { ...images[0], metadata: { credit: "Uncertain credit" }, userMetadata: { lastModified: new Date(Date.now()).toISOString() } };
        const overlay = { resource: { links: [{ rel: "edits", href: `https://metadata.example.test/metadata/${image.id}` }] } };
        stampImageRead(image, overlay, captureImageRead(), "lean"); attachEnrichment(image, overlay);
        return [image];
      }, publishImages: vi.fn(),
    });
    try {
      useMetadataDrafts.getState().setDraft(images[0].id, "metadata_credit", "Original", "Uncertain credit");
      editor.getState().flush(images[0].id, "metadata_credit");
      await vi.advanceTimersByTimeAsync(0);
      const receipt = [...editor.getState().saves.values()][0];
      expect(receipt.items).toMatchObject([{ state: "unknown", observation: "observed" }]);
      editor.getState().flush(images[0].id, "metadata_credit");
      await vi.advanceTimersByTimeAsync(1_000);
      expect([...editor.getState().saves.values()]).toEqual([receipt]);
      expect(execute).toHaveBeenCalledOnce();
      expect(useMetadataDrafts.getState().drafts.get(images[0].id)?.get("metadata_credit")?.value).toBe("Uncertain credit");
    } finally { editor.getState().dispose(); vi.useRealTimers(); }
  });

  it("preserves a final arrow edit across a newer overlapping intent while coalescing an adjacent repeat", async () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    vi.useFakeTimers();
    const peers = images.slice(0, 2).map(image => image.id);
    const credits = new Map<string, string>();
    const versions = new Map<string, string>();
    let revision = Date.now();
    const originalVersion = new Date(revision - 1_000).toISOString();
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const execute = vi.fn(async (command: { imageId: string; value?: unknown }): Promise<GridCommandResult> => {
      await held;
      const credit = String(command.value);
      credits.set(command.imageId, credit);
      versions.set(command.imageId, new Date(++revision).toISOString());
      return { outcome: "acknowledged", expected: { credit }, metadataWitness: String(revision) };
    });
    const editor = createMetadataEditorStore(execute, {
      readImages: async ids => ids.map(id => {
        const image = { ...images[0], id, metadata: { credit: credits.get(id) ?? "Original" },
          userMetadata: { lastModified: versions.get(id) ?? originalVersion } };
        const overlay = { resource: { links: [{ rel: "edits", href: `https://metadata.example.test/metadata/${id}` }] } };
        stampImageRead(image, overlay, captureImageRead(), "lean"); attachEnrichment(image, overlay);
        return image;
      }), publishImages: vi.fn(),
    });
    const click = (value: string, targetIds = peers) => {
      editor.getState().submitArrow({ fieldId: "metadata_credit", action: "overwrite", value, targetIds }, "credit-arrow");
      return editor.getState().arrowSaves.get("credit-arrow");
    };
    try {
      const first = click("A");
      await vi.advanceTimersByTimeAsync(0);
      expect(execute).toHaveBeenCalled();
      expect(click("A")).toBe(first);
      click("B", peers.slice(0, 1));
      click("A");
      release();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(execute).toHaveBeenCalledWith(expect.objectContaining({ imageId: peers[0], value: "B" }));
      expect(peers.map(id => credits.get(id))).toEqual(["A", "A"]);
    } finally { release(); editor.getState().dispose(); vi.useRealTimers(); }
  });

  it.each([["archived", true], ["archived", false], ["photoshoot", true], ["photoshoot", false], ["metadata_byline", false], ["metadata_byline", true]] as const)("accounts for every grouped target: %s, interrupted %s", async (fieldId, missing) => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    vi.useFakeTimers();
    const size = !missing && process.env.KUPUA_RECEIPT_SCALE === "1" ? 5000 : 201;
    const ids = Array.from({ length: size }, (_, index) => `boundary-${index}`);
    const ordinal = new Map(ids.map((id, index) => [id, index]));
    const written = new Set<string>();
    const readImages = vi.fn(async (requested: string[]) => {
      if (missing && fieldId === "metadata_byline" && requested[0] === ids[100]) {
        const batch: typeof images = [];
        batch[Symbol.iterator] = () => { throw new Error("Preflight interrupted after read"); };
        return batch;
      }
      return requested.filter(id => !missing || id !== ids[125]).map(id => {
      const image = { ...images[0], id, metadata: { byline: written.has(id) ? "Desk" : "Before" }, userMetadata: { archived: written.has(id), ...(written.has(id) && { photoshoot: { title: "Desk" } }), lastModified: written.has(id) ? "2026-11-26T10:01:00Z" : "2026-11-26T10:00:00Z" } };
      const overlay = { resource: { links: [{ rel: "edits", href: `https://metadata.example.test/metadata/${id}` }] } };
      stampImageRead(image, overlay, captureImageRead(), "lean"); attachEnrichment(image, overlay); return image;
      });
    });
    const editor = createMetadataEditorStore(async command => { written.add(command.imageId); return { outcome: "acknowledged", ...(fieldId === "metadata_byline" && { expected: { byline: "Desk" }, metadataWitness: "written" }) }; }, { readImages, publishImages: vi.fn() });
    let activePeak = 0, priorConfirmed = 0, prefixSlots = 0, publications = 0;
    const unsubscribe = editor.subscribe(state => {
      for (const save of state.saves.values()) if (save.state === "saving") {
        if (save.items.length) {
          publications++;
          const groupStart = Math.floor(ordinal.get(save.items.at(-1)!.imageId)! / BATCH_POLICY.maxTargets) * BATCH_POLICY.maxTargets;
          prefixSlots += Math.max(0, groupStart - ordinal.get(save.items[0].imageId)!);
        }
        activePeak = Math.max(activePeak, save.items.length);
        priorConfirmed = Math.max(priorConfirmed, save.settled?.confirmed ?? 0);
      }
    });
    try {
      const id = editor.getState().submit(fieldId === "archived" ? { fieldId, action: "overwrite", value: "archive", targetIds: ids } : { fieldId, action: "overwrite", value: "Desk", targetIds: ids })!;
      await vi.runAllTimersAsync();
      const save = editor.getState().saves.get(id)!;
      const expected = missing ? 100 : ids.length;
      if (missing && fieldId === "metadata_byline") expect(save.message).toContain("no automatic retry");
      expect([...written]).toEqual(ids.slice(0, expected));
      expect(save.items.map(item => item.imageId)).toEqual(ids);
      expect(save.items.slice(0, expected).every(item => item.observation === "observed")).toBe(true);
      expect(save.items.slice(expected).every(item => item.state === "not-started")).toBe(true);
      if (size === 5000) console.info("receipt scale", { fieldId, publications, activePeak, prefixSlots, priorConfirmed });
      expect(prefixSlots).toBe(0);
      expect(activePeak).toBe(BATCH_POLICY.maxTargets);
      if (!missing) expect(priorConfirmed).toBe(Math.floor((size - 1) / BATCH_POLICY.maxTargets) * BATCH_POLICY.maxTargets);
      if (missing && fieldId !== "metadata_byline") expect((await import("@/stores/metadata-editor-store")).metadataSaveStatus(save)).toContain("101 not sent");
      expect(readImages.mock.calls.every(([requested]) => requested.length <= 100)).toBe(true);
    } finally { unsubscribe(); editor.getState().dispose(); vi.useRealTimers(); }
  });

  it.each(["library/details", "shoot/form", "shoot/expired", "library/inside head", "library/stopped head", "library/stop parent", "library/shoot arrow", "library/automatic head"])("lends a settled group to an eligible outside user edit: %s", async scenario => {
    let invalid = false;
    vi.spyOn(gridSession, "invalidateGridSession").mockImplementation(() => { invalid = true; });
    vi.spyOn(gridSession, "isGridSessionInvalidated").mockImplementation(() => invalid);
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    vi.useFakeTimers();
    const ids = Array.from({ length: 101 }, (_, index) => `loan-${index}`);
    const written = new Set<string>(), credits = new Set<string>(), order: string[] = [];
    const queue = createBatchQueue();
    let resume!: () => void;
    const held = new Promise<void>(resolve => { resume = resolve; });
    const editor = createMetadataEditorStore(async command => {
      order.push(command.imageId);
      if (command.operation === "edit-metadata") {
        credits.add(command.imageId);
        return { outcome: "acknowledged", expected: { credit: "Manual" }, metadataWitness: "manual" };
      }
      written.add(command.imageId);
      return { outcome: "acknowledged" };
    }, { readImages: async requested => {
      if (requested.length === 1 && requested[0] === "outside" && (credits.has("outside") || written.has("outside"))) {
        await held;
        if (scenario === "shoot/expired") throw Object.assign(new Error("Session expired"), { status: 419 });
      }
      return requested.map(id => {
        const image = { ...images[0], id, metadata: { credit: credits.has(id) ? "Manual" : "Original" }, userMetadata: { archived: written.has(id), ...(written.has(id) && { photoshoot: { title: "Desk" } }), lastModified: written.has(id) || credits.has(id) ? "2026-11-26T10:01:00Z" : "2026-11-26T10:00:00Z" } };
        const overlay = { resource: { links: [{ rel: "edits", href: `https://metadata.example.test/metadata/${id}` }] } };
        stampImageRead(image, overlay, captureImageRead(), "lean"); attachEnrichment(image, overlay); return image;
      });
    }, publishImages: vi.fn() }, queue);
    const labelWrite = vi.fn().mockResolvedValue({ outcome: "rejected", status: 403 });
    const labels = createLabelEditorStore(labelWrite, { readImages: vi.fn(), publishImages: vi.fn() }, "connected", queue);
    const label = () => labels.getState().prepare("add", "news", { targetIds: ["label"], targets: new Map([["label", { resource: { links: [{ rel: "edits", href: "/metadata/label" }] } }]]) });
    try {
      const state = editor.getState();
      const parent = state.submit(scenario.startsWith("library") ? { fieldId: "archived", action: "overwrite", value: "archive", targetIds: ids } : { fieldId: "photoshoot", action: "overwrite", value: "Desk", targetIds: ids })!;
      await Promise.resolve();
      const details = (id: string) => state.submit({ fieldId: "metadata_credit", action: "overwrite", value: "Manual", targetIds: [id] }, false, undefined, "details-scalar");
      const arrow = scenario === "library/shoot arrow" || scenario === "library/automatic head";
      if (scenario === "library/inside head") details(ids[0]);
      if (arrow) {
        if (scenario === "library/automatic head") state.submit({ fieldId: "metadata_credit", action: "overwrite", value: "Manual", targetIds: ["automatic"] });
        state.submitArrow({ fieldId: "photoshoot", action: "overwrite", value: "Desk", targetIds: ["outside"] }, "shoot-arrow");
      } else if (scenario.startsWith("shoot")) {
        useMetadataDrafts.getState().setDraft("outside", "metadata_credit", "Original", "Manual");
        state.flush("outside", "metadata_credit");
      } else details("outside");
      if (scenario === "library/details" || scenario === "library/inside head") {
        expect(label()).toBe(false);
        expect(labels.getState().refusal).toBe("busy");
        const targetIds = ["later-label-1", "later-label-2"];
        expect(labels.getState().prepare("add", "news", { targetIds, targets: new Map(targetIds.map(id => [id, { resource: { links: [{ rel: "edits", href: `https://metadata.example.test/metadata/${id}` }] } }])) })).toBe(false);
        expect(labels.getState().refusal).toBe("busy");
      }
      const stoppedHead = scenario === "library/stopped head";
      if (stoppedHead) {
        state.stop(state.latestSingle("outside", "metadata_credit")!.id);
        expect(label()).toBe(true);
        details("outside");
      }
      await vi.advanceTimersByTimeAsync(3000);
      const insideHead = scenario === "library/inside head";
      expect(order).toEqual(insideHead ? [...ids, ids[0], "outside"] : scenario === "library/automatic head" ? [...ids, "automatic", "outside"] : stoppedHead ? [...ids, "outside"] : [...ids.slice(0, 100), "outside"]);
      const stopped = scenario === "library/stop parent";
      if (stopped) state.stop(parent);
      resume(); await vi.runAllTimersAsync();
      const receipt = editor.getState().saves.get(parent)!;
      expect(receipt.items.map(item => item.imageId)).toEqual(ids);
      const expired = scenario === "shoot/expired";
      expect(receipt.items.filter(item => item.observation === "observed")).toHaveLength(expired || stopped ? 100 : 101);
      expect(editor.getState().latestSingle("outside", arrow ? "photoshoot" : "metadata_credit")?.items[0].observation).toBe(expired ? "unavailable" : "observed");
      if (expired) expect(receipt.items.at(-1)).toMatchObject({ state: "not-started", result: { reason: "reload-required" } });
      if (stopped) expect(receipt.items.at(-1)?.state).toBe("stopped");
      expect(labelWrite).toHaveBeenCalledTimes(Number(stoppedHead));
      expect(written.size).toBe((expired || stopped ? 100 : 101) + Number(arrow));
      expect(order.filter(id => id === "outside")).toHaveLength(1);
    } finally { resume(); editor.getState().dispose(); labels.getState().dispose(); queue.dispose(); vi.useRealTimers(); }
  });

  it.each(["same tick", "coalescing"])("preserves an admitted manual waiter's position: %s", async scenario => {
    const queue = createBatchQueue();
    const readImages = vi.fn().mockResolvedValue([]);
    const editor = createMetadataEditorStore(vi.fn(), { readImages, publishImages: vi.fn() }, queue);
    const submit = (id: string, user: boolean) => editor.getState().submit({ fieldId: "metadata_credit", action: "overwrite", value: "Manual", targetIds: [id] }, false, undefined, user ? "user" : undefined);
    try {
      submit("first", scenario === "same tick");
      if (scenario === "coalescing") await Promise.resolve();
      const waiter = queue.admit({ imageId: "label", sequence: nextEditSequence(), effect: "image", conflicted: () => false })!;
      expect(waiter.wait).toBeDefined();
      submit("later", true);
      await waiter.wait;
      expect(readImages.mock.calls.map(([ids]) => ids)).toEqual([["first"]]);
      waiter.complete();
      await vi.waitFor(() => expect(readImages.mock.calls.map(([ids]) => ids)).toEqual([["first"], ["later"]]));
    } finally { editor.getState().dispose(); queue.dispose(); }
  });

  it("aborts a stopped Details preflight after a shared lend", async () => {
    const queue = createBatchQueue(), owner = queue.admit()!;
    let signal!: AbortSignal;
    const execute = vi.fn();
    const editor = createMetadataEditorStore(execute, { readImages: (_, pending) => new Promise((_, reject) => {
      signal = pending; signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }), publishImages: vi.fn() }, queue);
    try {
      const id = editor.getState().submit({ fieldId: "metadata_credit", action: "overwrite", value: "Manual", targetIds: ["outside"] }, false, undefined, "details-scalar")!;
      await Promise.resolve();
      const loan = queue.lendWaiting(owner, { ids: new Set(["parent"]), effect: "image" });
      expect(loan).toBeDefined();
      await Promise.resolve();
      editor.getState().stop(id);
      expect(signal.aborted).toBe(true);
      await loan;
      expect(execute).not.toHaveBeenCalled();
    } finally { editor.getState().dispose(); queue.dispose(); }
  });

  it("keeps a lent metadata arrow isolated through readback and returns its session halt", async () => {
    let invalid = false;
    vi.spyOn(gridSession, "invalidateGridSession").mockImplementation(() => { invalid = true; });
    vi.spyOn(gridSession, "isGridSessionInvalidated").mockImplementation(() => invalid);
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    vi.useFakeTimers();
    const queue = createBatchQueue(), owner = queue.admit()!;
    const writes: string[] = [];
    let resume!: () => void;
    const held = new Promise<void>(resolve => { resume = resolve; });
    const editor = createMetadataEditorStore(async command => {
      writes.push(command.imageId);
      return { outcome: "acknowledged", expected: { credit: "Manual" }, metadataWitness: "manual" };
    }, { readImages: async ids => {
      if (writes.length) { await held; throw Object.assign(new Error("Expired"), { status: 419 }); }
      return ids.map(id => {
        const image = { ...images[0], id };
        const overlay = { resource: { links: [{ rel: "edits", href: `https://metadata.example.test/metadata/${id}` }] } };
        stampImageRead(image, overlay, captureImageRead(), "lean"); attachEnrichment(image, overlay); return image;
      });
    }, publishImages: vi.fn() }, queue);
    try {
      for (const id of ["first", "second"]) editor.getState().submitArrow({ fieldId: "metadata_credit", action: "overwrite", value: "Manual", targetIds: [id] }, id);
      await vi.advanceTimersByTimeAsync(0);
      const loan = queue.lendWaiting(owner, { ids: new Set(["parent"]), effect: "image" });
      expect(loan).toBeDefined();
      let resumed = false;
      void loan!.then(() => { resumed = true; });
      await vi.advanceTimersByTimeAsync(BATCH_POLICY.observationIntervalMs);
      expect(writes).toEqual(["first"]);
      expect(resumed).toBe(false);
      resume(); await vi.runAllTimersAsync();
      await expect(loan).resolves.toBe("reload-required");
      owner.complete(); await vi.runAllTimersAsync();
      expect(writes).toEqual(["first"]);
    } finally { resume(); editor.getState().dispose(); queue.dispose(); vi.useRealTimers(); }
  });

  it.each(["early", "late", "session rejection", "shared waiter", "Details outside", "Details observed", "Details late", "Details joined automatic", "Details preflight 401", "Details preflight 503", "Details readback 419", "Details stop parent 419", "Details stopped"])("executes captured offscreen targets in bounded groups: %s", async scenario => {
    const recipientIndex = scenario === "late" ? 100 : 0;
    let invalid = false;
    vi.spyOn(gridSession, "invalidateGridSession").mockImplementation(() => { invalid = true; });
    vi.spyOn(gridSession, "isGridSessionInvalidated").mockImplementation(() => invalid);
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    vi.useFakeTimers();
    const ids = Array.from({ length: 101 }, (_, index) => `captured-${index}`);
    const values = new Map<string, string>();
    const bylines = new Map<string, string>();
    const versions = new Map<string, string>();
    const originalVersion = new Date(Date.now() - 1_000).toISOString();
    let revision = Date.now();
    let releaseDispatch!: () => void;
    const dispatchHeld = new Promise<void>(resolve => { releaseDispatch = resolve; });
    let releaseForm!: () => void;
    const formHeld = new Promise<void>(resolve => { releaseForm = resolve; });
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const execute = vi.fn(async (command: { imageId: string; fieldId?: string; value?: unknown }): Promise<GridCommandResult> => {
      if (execute.mock.calls.length <= 5) await dispatchHeld;
      if (scenario === "session rejection" && command.fieldId === "metadata_credit") return { outcome: "rejected", status: 401, errorKey: "unauthorized" };
      const field = command.fieldId === "metadata_byline" ? "byline" : "credit";
      (field === "credit" ? values : bylines).set(command.imageId, String(command.value));
      versions.set(command.imageId, new Date(++revision).toISOString());
      return { outcome: "acknowledged", expected: { [field]: String(command.value) }, metadataWitness: String(revision) };
    });
    const readImages = vi.fn(async (requested: string[], signal: AbortSignal) => {
      if (scenario === "Details stopped" && requested[0] === "outside") await new Promise<void>((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
      if (requested.length === 1 && requested[0] === "outside" && (scenario.includes("preflight") || scenario.includes("419") && values.has("outside"))) {
        if (scenario.includes("419")) await formHeld;
        throw Object.assign(new Error("Read refused"), { status: Number(scenario.split(" ").at(-1)) });
      }
      const result = requested.map(id => {
        const image = { ...images[0], id, metadata: { credit: values.get(id) ?? "Original", byline: bylines.get(id) }, userMetadata: { lastModified: versions.get(id) ?? originalVersion } };
        const overlay = { resource: { links: [{ rel: "edits", href: `https://metadata.example.test/metadata/${id}` }] } };
        stampImageRead(image, overlay, captureImageRead(), "lean"); attachEnrichment(image, overlay);
        return image;
      });
      if (requested.length === 1 && requested[0] === ids.at(-1) && bylines.has(requested[0]) && recipientIndex === 0) await held;
      if (requested.length === 1 && requested[0] === ids[recipientIndex] && values.get(requested[0]) === "Form credit") await formHeld;
      return result;
    });
    const shared = createBatchQueue();
    const editor = createMetadataEditorStore(execute, { readImages, publishImages: vi.fn() }, shared);
    try {
      const captured = [...ids, ids[0]];
      const id = editor.getState().submit({ fieldId: "metadata_byline", action: "overwrite", value: "Batch byline", targetIds: captured })!;
      captured.push("later-arrival");
      await vi.advanceTimersByTimeAsync(0);
      expect(execute).toHaveBeenCalledTimes(5);
      const waiter = scenario === "shared waiter" ? shared.admit() : undefined;
      if (scenario === "shared waiter" && !waiter) throw new Error("Shared waiter was not admitted");
      if (scenario.startsWith("Details")) {
        const target = scenario === "Details observed" ? ids[0] : scenario === "Details late" ? ids[100] : "outside";
        const intent = { fieldId: "metadata_credit", action: "overwrite", value: "Manual credit", targetIds: [target] } as const;
        const earlier = scenario === "Details joined automatic" ? editor.getState().submit(intent) : undefined;
        const capturedIds = [target];
        const field = RECONCILE_FIELDS.find(field => field.id === "metadata_credit")!;
        render(<MetadataEditorContext value={editor}><dl><MetadataTextEditor field={field} targetIds={capturedIds} value="Old">Old</MetadataTextEditor></dl></MetadataEditorContext>);
        fireEvent.click(screen.getByRole("button", { name: "Edit Credit" }));
        fireEvent.change(screen.getByLabelText("Credit", { selector: "input" }), { target: { value: "Manual credit" } });
        fireEvent.click(screen.getByRole("button", { name: "Commit Credit" }));
        const manual = editor.getState().panelSaves[0].id;
        cleanup();
        if (scenario === "Details joined automatic") { expect(earlier).toBeDefined(); expect(manual).toBe(earlier); }
        const failedRead = scenario.includes("401") || scenario.includes("419");
        const successor = failedRead ? editor.getState().submit({ ...intent, targetIds: ["following"] }) : undefined;
        releaseDispatch(); release();
        if (scenario === "Details stopped") {
          await vi.advanceTimersByTimeAsync(BATCH_POLICY.observationIntervalMs);
          expect(editor.getState().saves.get(manual)?.state).toBe("saving");
          editor.getState().stop(manual);
          await vi.advanceTimersByTimeAsync(0);
          expect(bylines.size).toBe(101);
          expect(values.size).toBe(0);
          expect(editor.getState().saves.get(manual)?.message).toMatch(/Stopped/);
          return;
        }
        if (scenario.includes("419")) {
          await vi.advanceTimersByTimeAsync(BATCH_POLICY.observationIntervalMs);
          expect(values.get("outside")).toBe("Manual credit");
          expect(bylines.has(ids[100])).toBe(false);
          if (scenario === "Details stop parent 419") editor.getState().stop(id);
        }
        releaseForm();
        await vi.advanceTimersByTimeAsync(BATCH_POLICY.observationWindowMs + 1);
        const calls = execute.mock.calls.map(([command]) => command);
        expect(calls.filter(command => command.fieldId === "metadata_byline").map(command => command.imageId).toSorted()).toEqual((failedRead ? ids.slice(0, 100) : ids).toSorted());
        const single = editor.getState().saves.get(manual)!;
        const creditCalls = calls.filter(command => command.fieldId === "metadata_credit");
        expect(creditCalls.map(command => command.imageId)).toEqual(scenario.includes("preflight") ? [] : [target]);
        if (failedRead) {
          expect(editor.getState().saves.get(successor!)?.items[0]).toMatchObject({ state: "not-started", result: { reason: "reload-required" } });
          const parent = editor.getState().saves.get(id)!;
          if (scenario === "Details stop parent 419") {
            expect(parent.message).toMatch(/Stopped/);
            expect(parent.items.some(item => item.imageId === ids[100] && item.state === "not-started")).toBe(false);
          } else expect(parent.items.at(-1)).toMatchObject({ imageId: ids[100], state: "not-started", result: { reason: "reload-required" } });
          expect(single.items[0]).toMatchObject(scenario.includes("401") ? { state: "not-started" } : { state: "accepted-awaiting-visibility", observation: "unavailable", reloadRequired: true });
        } else if (scenario.includes("503")) {
          expect(single.items[0]).toMatchObject({ state: "not-started", result: { reason: "unavailable" } });
        } else {
          expect(single.items[0].observation).toBe("observed");
          expect(calls.indexOf(creditCalls[0])).toBe(scenario === "Details late" || scenario === "Details joined automatic" ? 101 : 100);
          expect(values.get(target)).toBe("Manual credit");
          if (ids.includes(target)) expect(bylines.get(target)).toBe("Batch byline");
        }
        return;
      }
      useMetadataDrafts.getState().setDraft(ids[recipientIndex], "metadata_credit", "Original", "Form credit");
      editor.getState().flush(ids[recipientIndex], "metadata_credit");
      releaseDispatch();
      await vi.advanceTimersByTimeAsync(BATCH_POLICY.observationIntervalMs);
      const calls = execute.mock.calls.map(([command]) => command);
      const bulk = calls.filter(command => command.fieldId === "metadata_byline").map(command => command.imageId);
      expect(bulk.toSorted()).toEqual((scenario === "session rejection" ? ids.slice(0, 100) : ids).toSorted());
      const formIndex = calls.findIndex(command => command.fieldId === "metadata_credit");
      if (scenario === "shared waiter") {
        expect(formIndex).toBe(-1);
        waiter!.complete(); release(); releaseForm();
        await vi.advanceTimersByTimeAsync(0);
        expect(values.get(ids[0])).toBe("Form credit");
        expect(execute).toHaveBeenCalledTimes(ids.length + 1);
        return;
      }
      expect(calls.filter(command => command.fieldId === "metadata_credit").map(command => command.imageId)).toEqual([ids[recipientIndex]]);
      expect(formIndex).toBe(recipientIndex === 0 ? 100 : 101);
      if (scenario === "session rejection") {
        expect(editor.getState().saves.get(id)?.items.at(-1)).toMatchObject({ imageId: ids[100], state: "not-started", result: { outcome: "blocked", reason: "reload-required" } });
        return;
      }
      expect(calls[recipientIndex === 0 ? formIndex + 1 : formIndex - 1]).toMatchObject({ imageId: ids[100], fieldId: "metadata_byline" });
      releaseForm();
      await vi.advanceTimersByTimeAsync(0);
      if (recipientIndex === 100) {
        expect(editor.getState().latestSingle(ids[100], "metadata_credit")?.items[0].observation).toBe("observed");
        return;
      }
      expect(editor.getState().saves.get(id)?.state).toBe("saving");
      expect(getMetadataWriteWitness(ids[0])).toBeTypeOf("string");
      const successor = editor.getState().submit({ fieldId: "metadata_credit", action: "overwrite", value: "New credit", targetIds: [ids[0]] })!;
      await vi.advanceTimersByTimeAsync(0);
      expect(execute.mock.calls.at(-1)?.[0]).toMatchObject({ imageId: ids[0], value: "New credit" });
      expect(editor.getState().saves.get(successor)?.items).toMatchObject([{ observation: "observed" }]);
      expect(editor.getState().saves.get(id)?.state).toBe("saving");
      release();
      await vi.advanceTimersByTimeAsync(0);
      expect(readImages.mock.calls.every(([requested]) => requested.length <= BATCH_POLICY.maxTargets)).toBe(true);
      expect(editor.getState().saves.get(id)).toMatchObject({ state: "finished", excluded: 0 });
      expect(editor.getState().saves.get(id)?.items.every(item => item.observation === "observed")).toBe(true);
      expect(getMetadataWriteWitness(ids[0])).toBeUndefined();
      const overflow = editor.getState().submit({ fieldId: "metadata_credit", action: "overwrite", value: "Blocked",
        targetIds: Array.from({ length: BATCH_POLICY.maxTouchedImages }, (_, index) => `overflow-${index}`) })!;
      await vi.advanceTimersByTimeAsync(0);
      expect(editor.getState().saves.get(overflow)?.message).toContain("capacity");
      expect(execute).toHaveBeenCalledTimes(103);
    } finally { releaseDispatch(); releaseForm(); release(); editor.getState().dispose(); shared.dispose(); vi.useRealTimers(); }
  });

  it("retains and coalesces Form intent behind shared work without clearing a newer draft", async () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    vi.useFakeTimers();
    const queue = createBatchQueue();
    const blocker = queue.admit()!;
    let credit = "Original";
    let release!: () => void;
    const execute = vi.fn(async (command: { imageId: string; value?: unknown }): Promise<GridCommandResult> => {
      await new Promise<void>(resolve => { release = resolve; });
      credit = String(command.value);
      return { outcome: "acknowledged", expected: { credit } };
    });
    const editor = createMetadataEditorStore(execute, {
      readImages: async () => {
        const image = { ...images[0], metadata: { credit }, userMetadata: { lastModified: new Date(Date.now()).toISOString() } };
        const overlay = { resource: { links: [{ rel: "edits", href: `https://metadata.example.test/metadata/${image.id}` }] } };
        stampImageRead(image, overlay, captureImageRead(), "lean");
        attachEnrichment(image, overlay);
        return [image];
      }, publishImages: vi.fn(),
    }, queue);
    const change = (value: string) => {
      useMetadataDrafts.getState().setDraft(images[0].id, "metadata_credit", "Original", value,
        [...editor.getState().saves.values()].some(save => save.state !== "finished"));
      editor.getState().schedule(images[0].id, "metadata_credit");
    };
    try {
      change("First draft");
      editor.getState().deferDraft(images[0].id, "metadata_credit");
      editor.getState().schedule(images[0].id, "metadata_credit");
      await vi.advanceTimersByTimeAsync(550);
      editor.getState().settleDraftGrant(images[0].id, "metadata_credit", true);
      await vi.advanceTimersByTimeAsync(50);
      expect(queue.admit()).toBeUndefined();
      change("Replacement draft");
      editor.getState().flush(images[0].id, "metadata_credit");
      const waiter = queue.admit();
      expect(waiter).toBeDefined();
      expect(execute).not.toHaveBeenCalled();
      blocker.complete(); waiter!.complete();
      await vi.advanceTimersByTimeAsync(0);
      expect(execute).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ value: "Replacement draft" }));
      change("Original");
      await vi.advanceTimersByTimeAsync(600);
      change("Replacement draft");
      release();
      await vi.advanceTimersByTimeAsync(0);
      expect(useMetadataDrafts.getState().drafts.get(images[0].id)?.get("metadata_credit")?.value).toBe("Replacement draft");
      expect(execute).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(250);
      release();
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(600);
      expect(execute).toHaveBeenCalledTimes(3);
      release();
      await vi.advanceTimersByTimeAsync(0);
      expect(useMetadataDrafts.getState().drafts.size).toBe(0);
    } finally { editor.getState().dispose(); queue.dispose(); vi.useRealTimers(); }
  });

  it("puts Upload restrictions in the cost tooltip without repeating the banner", () => {
    const image = { ...images[0], usageRights: { category: "pr-and-third-party", restrictions: "Print only" } };
    const upload = (id: string) => <ImageMetadata image={{ ...image, id }} overlay={{ usageRights: image.usageRights }}
      formFields={new Set()} openUploadImage={() => {}} renderForm={(metadata, status) => <>{status}{metadata}</>} />;
    const mounted = render(upload(image.id));
    expect(within(screen.getByRole("group", { name: "Image status" })).getByTitle("Restrictions: Print only").textContent).toBe("Restricted use");
    expect(screen.queryByText("Restricted use:")).toBeNull();
    const badge = screen.getByRole("button", { name: /Restricted use/i });
    fireEvent.click(badge);
    expect(screen.getByText("Restrictions: Print only")).toBeTruthy();
    fireEvent.keyDown(badge, { key: "Escape" });
    expect(screen.queryByText("Restrictions: Print only")).toBeNull();
    fireEvent.click(badge);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByText("Restrictions: Print only")).toBeNull();
    fireEvent.click(badge);
    mounted.rerender(upload(images[1].id));
    expect(screen.queryByText("Restrictions: Print only")).toBeNull();
    mounted.rerender(<ImageMetadata image={image} overlay={{ usageRights: { category: "pr-and-third-party", restrictions: "Print only" } }} />);
    expect(screen.getByText("Restricted use:").parentElement?.textContent).toContain("Print only");
  });

  it("uses Upload's editorial order and guidance without changing Details", () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    gridConfig.imageTypes.splice(0, gridConfig.imageTypes.length, "Photograph");
    const image: Image = { ...images[0],
      uploadInfo: { ...images[0].uploadInfo, filename: "editorial-image.jpg" },
      source: { ...images[0].source, mimeType: "image/jpeg", size: 1024, orientedDimensions: { width: 700, height: 500 } },
      metadata: { ...images[0].metadata, title: "Retained title", description: "Short", byline: "Picture desk",
        credit: "Desk", copyright: "Desk copyright", city: "London", dateTaken: "2026-11-18T12:00:00Z",
        usageInstructions: "Supplied instructions", specialInstructions: "Further instructions",
        subjects: ["News"], peopleInImage: ["A person"], keywords: ["Editorial"], source: "Wire source" },
      userMetadata: { ...images[0].userMetadata, labels: ["Desk label"], photoshoot: { title: "Assignment" } },
      collections: [{ pathId: "desk/news", path: ["desk", "news"] }],
    };
    const mounted = render(<ImageMetadata image={image} formFields={new Set(FORM_METADATA_FIELDS.map(field => field.id))} />);
    expect([...mounted.container.querySelectorAll("[data-measured-field]")].map(element => element.getAttribute("data-measured-field"))).toEqual([
      "metadata_imageType", "metadata_title", "metadata_description", "metadata_byline", "metadata_credit", "metadata_dateTaken", "location",
      "location_subLocation", "location_state", "location_city", "location_country",
      "metadata_copyright", "metadata_usageInstructions", "metadata_specialInstructions",
      "collections", "labels", "people", "keywords", "subjects", "photoshoot", "uploadInfo_filename", "form_fileInfo",
    ]);
    expect(screen.getByLabelText("Byline").getAttribute("placeholder")).toBe("Author’s name ONLY, leave empty if unknown");
    expect(screen.getByRole("textbox", { name: "Description", description: "Add context: who, what, where and when." })).toBeTruthy();
    expect(screen.getByRole("option", { name: /choose type/ }).textContent).toBe("───  choose type  ───");
    expect(fieldRow("File info").textContent).toContain("jpeg, 700 × 500, 1 KB");
    expect(screen.queryByText("File type", { selector: "dt" })).toBeNull();
    expect(screen.queryByText("Dimensions", { selector: "dt" })).toBeNull();
    for (const noun of ["collection", "label", "person", "keyword"]) {
      fireEvent.click(screen.getByRole("button", { name: `Add ${noun}` }));
      fireEvent.change(screen.getByLabelText(`New ${noun}`), { target: { value: `Another ${noun}` } });
      fireEvent.click(screen.getByRole("button", { name: `Commit new ${noun}` }));
      expect(screen.queryByLabelText(`New ${noun}`)).toBeNull();
      expect(screen.getByRole("button", { name: `Add ${noun}` })).toBe(document.activeElement);
    }
    fireEvent.click(screen.getByRole("button", { name: "Choose subjects" }));
    expect(screen.getByRole("checkbox", { name: "sport" })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "New subject" })).toBeNull();
    for (const label of ["Uploaded", "Modified", "Uploader", "Additional metadata", "Syndication rights"]) {
      expect(screen.queryByText(label)).toBeNull();
    }
    expect(screen.getByLabelText("Special instructions").tagName).toBe("TEXTAREA");
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "An editorial description with enough context about this image." } });
    expect(screen.queryByText(/Your description is too short/)).toBeNull();
    for (const label of ["Description", "Credit"]) {
      const input = screen.getByLabelText(label) as HTMLInputElement | HTMLTextAreaElement;
      fireEvent.change(input, { target: { value: "" } });
      expect(input.checkValidity()).toBe(false);
      if (label === "Description") expect(screen.getByRole("textbox", { name: label, description: "Description is required." })).toBe(input);
      else expect(screen.queryByText(`${label} is required.`)).toBeNull();
    }
    fireEvent.click(screen.getByRole("button", { name: "Add label" }));
    act(() => useEnrichmentStore.getState().setEnrichment(new Map()));
    expect(within(fieldRow("Labels")).queryByText("Empty")).toBeNull();
    expect(screen.queryByRole("button", { name: /Apply .* to all selected images/ })).toBeNull();
    expect((screen.getByRole("button", { name: "Commit new label" }) as HTMLButtonElement).disabled).toBe(true);
    mounted.rerender(<ImageMetadata image={image} />);
    expect(fieldRow("By")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Additional metadata" })).toBeTruthy();
    expect(screen.getByText("Syndication rights")).toBeTruthy();
    expect(screen.queryByText("File type", { selector: "dt" })).toBeNull();
    expect(screen.queryByText(/Your description is too short/)).toBeNull();
  });

  it("edits supplied and missing Form locations and dates directly with retained unsent drafts", () => {
    const formFields = new Set(FORM_METADATA_FIELDS.map(field => field.id));
    const image = { ...images[0], metadata: { ...images[0].metadata, subLocation: "Venue", state: "Region",
      city: "London", country: "United Kingdom", dateTaken: "2026-11-18T12:00:00Z" } };
    const mounted = render(<ImageMetadata image={image} formFields={formFields} />);
    for (const label of ["Sublocation", "State", "City", "Country", "Taken on"]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
      expect(document.activeElement).not.toBe(screen.getByLabelText(label));
    }
    for (const name of ["Edit Location", "Commit Location", "Cancel Location", "Edit Taken on", "Commit Taken on", "Cancel Taken on"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect((screen.getByLabelText("City") as HTMLInputElement).value).toBe("London");
    expect((screen.getByLabelText("Taken on") as HTMLInputElement).type).toBe("datetime-local");
    expect((screen.getByLabelText("Taken on") as HTMLInputElement).value).not.toBe("");
    fireEvent.change(screen.getByLabelText("City"), { target: { value: "Manchester" } });
    fireEvent.change(screen.getByLabelText("Taken on"), { target: { value: "2026-11-19T13:15" } });
    expect(useMetadataDrafts.getState().drafts.get(image.id)?.get("location_city")?.value).toBe("Manchester");
    expect(useMetadataDrafts.getState().drafts.get(image.id)?.has("metadata_dateTaken")).toBe(true);
    expect(screen.queryByText("Not sent")).toBeNull();
    expect(image.metadata.city).toBe("London");
    expect(image.metadata.dateTaken).toBe("2026-11-18T12:00:00Z");
    mounted.unmount();
    const restored = render(<ImageMetadata image={image} formFields={formFields} />);
    expect((screen.getByLabelText("City") as HTMLInputElement).value).toBe("Manchester");
    expect((screen.getByLabelText("Taken on") as HTMLInputElement).value).toBe("2026-11-19T13:15");
    restored.unmount();
    render(<ImageMetadata image={{ ...images[1], metadata: {} }} formFields={formFields} />);
    for (const label of ["Sublocation", "State", "City", "Country", "Taken on"]) {
      const input = screen.getByLabelText(label) as HTMLInputElement;
      expect(input.value).toBe("");
      expect(document.activeElement).not.toBe(input);
    }
    fireEvent.change(screen.getByLabelText("Country"), { target: { value: "France" } });
    expect(useMetadataDrafts.getState().drafts.get(images[1].id)?.get("location_country")?.value).toBe("France");
    act(() => useEnrichmentStore.getState().setEnrichment(new Map()));
    expect((screen.getByLabelText("Country") as HTMLInputElement).readOnly).toBe(true);
    expect((screen.getByLabelText("Taken on") as HTMLInputElement).readOnly).toBe(true);
  });

  it("keeps the Form calendar at whole seconds while preserving original fractions and typed wall-clock values", () => {
    vi.stubEnv("TZ", "Europe/London");
    const field = RECONCILE_FIELDS.find(field => field.id === "metadata_dateTaken")!;
    const original = "2026-10-25T01:30:33.123Z";
    const editor = createMetadataEditorStore();
    const submitArrow = vi.fn();
    editor.setState({ connected: true, submitArrow, schedule: vi.fn() });
    render(<MetadataEditorContext value={editor}><FormBatchContext value={{ key: "batch", ids: ["first", "peer"] }}>
      <MetadataFormField imageId="first" field={field} value={original} editable />
    </FormBatchContext></MetadataEditorContext>);
    const input = screen.getByLabelText("Taken on") as HTMLInputElement;
    const arrow = screen.getByRole("button", { name: "Apply Taken on to 1 other image" });
    fireEvent.click(arrow);
    expect(submitArrow.mock.lastCall?.[0]).toMatchObject({ value: original, targetIds: ["peer"] });
    const originalSecond = input.value.slice(0, 19);
    expect(input.step).toBe("1");
    expect(input.getAttribute("value")).toBe(originalSecond);
    fireEvent.change(input, { target: { value: "2026-11-12T10:20:30" } });
    fireEvent.click(arrow);
    expect(submitArrow.mock.lastCall?.[0]).toMatchObject({ value: "2026-11-12T10:20:30.000Z", targetIds: ["peer"] });
    expect(useMetadataDrafts.getState().drafts.get("first")?.get(field.id)?.value).toBe("2026-11-12T10:20:30.000");
    fireEvent.change(input, { target: { value: originalSecond } });
    expect(useMetadataDrafts.getState().drafts.size).toBe(0);
    fireEvent.change(input, { target: { value: "2026-03-29T01:30" } });
    expect(input.value).toBe("2026-03-29T01:30");
    expect(useMetadataDrafts.getState().drafts.get("first")?.get(field.id)?.value).toBe("2026-03-29T01:30:00.000");
    fireEvent.change(input, { target: { value: "" } });
    expect(useMetadataDrafts.getState().drafts.get("first")?.get(field.id)?.value).toBe("2026-03-29T01:30:00.000");
    expect(input.value).toBe("2026-03-29T01:30");
    const submit = vi.fn();
    editor.setState({ hasPendingField: () => true, submit });
    fireEvent.change(input, { target: { value: originalSecond } });
    fireEvent.click(arrow);
    editor.getState().flush("first", field.id);
    expect(submitArrow.mock.lastCall?.[0]).toMatchObject({ value: original, targetIds: ["peer"] });
    expect(submit.mock.lastCall?.[0]).toMatchObject({ value: original, targetIds: ["first"] });
    editor.getState().dispose();
  });

  it("does not attach an earlier Upload receipt to a newer Credit draft", () => {
    vi.useFakeTimers();
    const editor = createMetadataEditorStore(vi.fn(), { readImages: vi.fn(), publishImages: vi.fn() });
    const field = RECONCILE_FIELDS.find(field => field.id === "metadata_credit")!;
    try {
      render(<MetadataEditorContext value={editor}><MetadataFormField imageId="source" field={field} value="First" editable /></MetadataEditorContext>);
      const input = screen.getByLabelText("Credit");
      fireEvent.change(input, { target: { value: "Desk" } });
      fireEvent.blur(input);
      act(() => vi.advanceTimersByTime(150));
      expect(screen.getByRole("button", { name: "Saving Credit" })).toBeTruthy();
      fireEvent.change(input, { target: { value: "New caption credit" } });
      const save = [...editor.getState().saves.values()][0];
      act(() => editor.setState({ saves: new Map([[save.id, { ...save, state: "finished", items: [{ imageId: "source", state: "rejected" }] }]]) }));
      expect(screen.queryByRole("button", { name: "Credit not saved" })).toBeNull();
      expect(screen.queryByText("Not saved")).toBeNull();
      expect((input as HTMLInputElement).value).toBe("New caption credit");
    } finally { editor.getState().dispose(); vi.useRealTimers(); }
  });

  it("retains sparse form drafts across unmount and canonical changes without changing canonical metadata", () => {
    const field = RECONCILE_FIELDS.find(field => field.id === "metadata_description")!;
    const view = (value: string, editable = true) => <MetadataFormField imageId="first" field={field} value={value} editable={editable} required />;
    const mounted = render(view("Original"));
    expect(useMetadataDrafts.getState().drafts.size).toBe(0);
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Retained draft" } });
    mounted.unmount();
    const next = render(view("New canonical", false));
    const input = screen.getByLabelText("Description") as HTMLTextAreaElement;
    expect(input.value).toBe("Retained draft");
    expect(input.readOnly).toBe(true);
    expect(screen.queryByText("Not sent")).toBeNull();
    next.rerender(view("New canonical"));
    fireEvent.change(input, { target: { value: "" } });
    expect(input.checkValidity()).toBe(false);
    expect(screen.queryByText("Description is required.")).toBeNull();
    fireEvent.change(input, { target: { value: "Original" } });
    expect(input.value).toBe("Original");
    const warning = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(warning);
    expect(warning.defaultPrevented).toBe(true);
    fireEvent.change(input, { target: { value: "New canonical" } });
    expect(useMetadataDrafts.getState().drafts.size).toBe(0);
    expect(input.value).toBe("New canonical");
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
  });

  it("shows the chosen collection spelling while passing its canonical ID to the editor", async () => {
    const item = { value: "sport/uk news", label: "Sport/UK News" };
    vi.spyOn(typeahead, "buildTypeaheadFields").mockReturnValue([{ fieldName: "collection", resolver: async () => [item] }]);
    const onChange = vi.fn();
    const entry = (value: string) => <MetadataSuggestionInput label="New collection" fieldKey="collection" value={value} onChange={onChange} />;
    const view = render(entry("UK"));
    fireEvent.click(await screen.findByRole("option", { name: item.label }));
    expect(onChange).toHaveBeenCalledWith(item.value, true);
    view.rerender(entry(item.value));
    const input = screen.getByRole("combobox") as HTMLInputElement;
    expect(input.value).toBe(item.label);
    fireEvent.change(input, { target: { value: "Archive" } });
    expect(onChange).toHaveBeenLastCalledWith("Archive");
    view.rerender(entry("Archive"));
    expect(input.value).toBe("Archive");
  });

  it("keeps inactive form fields from taking focus or requesting suggestions on arrival", async () => {
    vi.useFakeTimers();
    try {
      const resolve = vi.fn(async () => [{ value: "Reuters" }]);
      vi.spyOn(typeahead, "buildTypeaheadFields").mockReturnValue([{ fieldName: "credit", resolver: resolve }]);
      render(<MetadataSuggestionInput label="Credit" fieldKey="credit" value="" onChange={() => {}} autoFocus={false} />);
      const input = screen.getByLabelText("Credit");
      expect(document.activeElement).not.toBe(input);
      await act(() => vi.advanceTimersByTimeAsync(150));
      expect(resolve).not.toHaveBeenCalled();
      act(() => input.focus());
      expect(document.activeElement).toBe(input);
      await act(() => vi.advanceTimersByTimeAsync(150));
      expect(resolve).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });

  it.each(["single", "multiple"])("keeps Source in collapsible additional metadata and Labels separate in %s panels", context => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const populated = images.map(image => ({ ...image, metadata: { ...image.metadata, source: "Wire source" },
      userMetadata: { ...image.userMetadata, labels: ["fixture-label"], photoshoot: { title: "Fixture photoshoot" } } }));
    render(context === "single" ? <ImageMetadata image={populated[0]} />
      : <MultiImageMetadata images={populated} reconciledView={recomputeAll(populated, RECONCILE_FIELDS)} total={2} />);
    const additional = screen.getByRole("region", { name: "Additional metadata" });
    expect(within(additional).queryByRole("button", { name: "Wire source" })).toBeNull();
    fireEvent.click(within(additional).getByRole("button", { name: "Show additional metadata" }));
    expect(within(additional).getByRole("button", { name: "Wire source" })).toBeTruthy();
    fireEvent.click(within(additional).getByRole("button", { name: "Hide additional metadata" }));
    expect(within(additional).queryByRole("button", { name: "Wire source" })).toBeNull();
    expect(fieldRow("Labels").parentElement?.contains(fieldRow("Photoshoot"))).toBe(false);
  });

  it.each(["single", "multiple"])("keeps important empty fields but hides optional empty fields for %s viewers", context => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    useEnrichmentStore.getState().setEnrichment(new Map());
    gridConfig.imageTypes.splice(0, gridConfig.imageTypes.length, "Photograph");
    const empty = images.map(image => ({ ...image, metadata: {}, collections: [], userMetadata: { labels: [] }, usageRights: { category: "" } }));
    render(context === "single" ? <ImageMetadata image={empty[0]} />
      : <MultiImageMetadata images={empty} reconciledView={recomputeAll(empty, RECONCILE_FIELDS)} total={2}
        labelEditing={{ targetIds: empty.map(image => image.id), targets: new Map(empty.map(image => [image.id, { resource: { links: [] } }])) }} />);
    for (const label of ["Image type", "Title", "Description", "Special instructions", "Taken on", "Credit"]) {
      expect(within(fieldRow(label)).getByText("Unknown")).toBeTruthy();
      expect(screen.queryByRole("button", { name: `Edit ${label}` })).toBeNull();
    }
    if (context === "single") expect((within(fieldRow("Labels")).getByRole("button", { name: "Add label" }) as HTMLButtonElement).disabled).toBe(true);
    else expect(screen.queryByRole("button", { name: "Add label" })).toBeNull();
    for (const label of ["By", "Copyright", "Location", "People", "Subjects", "Keywords", "Collections"]) {
      expect(screen.queryByText(label, { selector: "dt" })).toBeNull();
    }
  });

  it("does not leave idle batch arrows beside hidden empty Form pills for a viewer", () => {
    const editor = createMetadataEditorStore(vi.fn(), { readImages: vi.fn(), publishImages: vi.fn() });
    const image = { ...images[0], metadata: {}, collections: [], userMetadata: { labels: [] } };
    try {
      render(<MetadataEditorContext value={editor}><FormBatchContext value={{ key: "batch", ids: [image.id, "peer"] }}>
        <ImageMetadata image={image} overlay={{ resource: { links: [] } }} formFields={new Set(["subjects", "people", "labels", "keywords", "collections"])} />
      </FormBatchContext></MetadataEditorContext>);
      expect(within(fieldRow("Labels")).getByText("Unknown")).toBeTruthy();
      for (const label of ["Subjects", "People", "Keywords", "Collections"]) {
        expect(screen.queryByText(label, { selector: "dt" })).toBeNull();
        expect(screen.queryByRole("button", { name: `Clear ${label.toLowerCase()} on 1 other image` })).toBeNull();
      }
    } finally { editor.getState().dispose(); }
  });

  it.each(["single", "multiple"])("explains editable empty values and further instructions in %s metadata", context => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const empty = images.map(image => ({ ...image, metadata: { usageInstructions: "Upstream restrictions" } }));
    render(context === "single" ? <ImageMetadata image={empty[0]} />
      : <MultiImageMetadata images={empty} reconciledView={recomputeAll(empty, RECONCILE_FIELDS)} total={2} />);
    expect(fieldRow("Title").textContent).toContain("Unknown (click ");
    expect(fieldRow("Special instructions").textContent).toContain("add further instructions");
    expect(fieldRow("Special instructions").textContent).not.toContain("Unknown");
    expect(fieldRow("Location").textContent).toContain("Unknown (click ");
    fireEvent.click(within(fieldRow("Title")).getByRole("button", { name: "Add Title" }));
    expect(screen.getByLabelText("Title")).toBeTruthy();
  });

  it.each(["single", "multiple", "form"])("retains populated metadata when %s edit authority is withdrawn", context => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const populated = images.map(image => ({ ...image, metadata: { credit: "Picture desk", city: "London", peopleInImage: ["A person"], subjects: ["sport"], keywords: ["Match day"] } }));
    render(context === "multiple" ? <MultiImageMetadata images={populated} reconciledView={recomputeAll(populated, RECONCILE_FIELDS)} total={2} />
      : <ImageMetadata image={populated[0]} formFields={context === "form" ? new Set(["subjects", "people", "keywords"]) : undefined} />);
    expect(screen.getByRole("button", { name: "Add keyword" })).toBeTruthy();
    if (context !== "form") expect(screen.getByRole("button", { name: "Edit Credit" })).toBeTruthy();
    act(() => useEnrichmentStore.getState().upsertEnrichment(new Map([[populated[0].id, { resource: { links: [] } }]])));
    expect(screen.queryByRole("button", { name: "Edit Credit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add person" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Choose subjects" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add keyword" })).toBeNull();
    for (const value of ["A person", "sport", "Match day", ...(context === "form" ? [] : ["Picture desk", "London"])]) expect(screen.getByText(value)).toBeTruthy();
  });

  it.each([
    { open: "Edit Description", input: "Description", commit: "Commit Description" },
    { open: "Edit Location", input: "City", commit: "Commit Location" },
    { open: "Add keyword", input: "New keyword", commit: "Commit new keyword" },
    { open: "Add collection", input: "New collection", commit: "Commit new collection" },
  ])("retains the $input draft while selected edit authority is withheld", ({ open, input, commit }) => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    render(<MultiImageMetadata images={images} reconciledView={recomputeAll(images, RECONCILE_FIELDS)} total={2} />);
    fireEvent.click(screen.getByRole("button", { name: open }));
    const control = screen.getByLabelText(input) as HTMLInputElement | HTMLTextAreaElement;
    fireEvent.change(control, { target: { value: "Unsent draft" } });
    const permitted = useEnrichmentStore.getState().data.get(images[0].id)!;
    act(() => useEnrichmentStore.getState().upsertEnrichment(new Map([[images[0].id, { resource: { links: [] } }]])));
    expect(screen.getByLabelText(input)).toBe(control);
    expect(control.value).toBe("Unsent draft");
    expect(screen.getByRole("button", { name: commit }).hasAttribute("disabled")).toBe(true);
    act(() => useEnrichmentStore.getState().upsertEnrichment(new Map([[images[0].id, permitted]])));
    expect(screen.getByLabelText(input)).toBe(control);
    expect(screen.getByRole("button", { name: commit }).hasAttribute("disabled")).toBe(false);
  });

  it("explains mixed scalar editing without describing unresolved metadata as empty", () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const selected = images.map((image, index) => ({ ...image, metadata: { title: index ? "Second title" : "First title" } }));
    const context = { targetIds: selected.map(image => image.id), targets: new Map() };
    const { rerender } = render(<MultiImageMetadata images={selected} total={2} labelEditing={context}
      reconciledView={recomputeAll(selected, RECONCILE_FIELDS)} />);
    expect(fieldRow("Title").textContent).toContain("Multiple titles (click ");
    expect(within(fieldRow("Title")).getByText("all", { selector: "strong" })).toBeTruthy();
    rerender(<MultiImageMetadata images={selected} total={2} labelEditing={{ ...context, pending: true }} reconciledView={null} />);
    expect(fieldRow("Title").textContent).not.toContain("Unknown");
    expect(screen.getByRole("button", { name: "Edit Title" }).hasAttribute("disabled")).toBe(true);
  });

  it("applies a partially selected Subject without replacing the selection's other subjects", () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const selected = images.map((image, index) => ({ ...image, metadata: { subjects: index ? ["arts"] : ["news"] } }));
    const ids = selected.map(image => image.id);
    const editor = createMetadataEditorStore(vi.fn(), { readImages: vi.fn(), publishImages: vi.fn() });
    try {
      render(<MetadataEditorContext value={editor}><MultiImageMetadata images={selected} total={ids.length}
        labelEditing={{ targetIds: ids, targets: new Map() }} reconciledView={recomputeAll(selected, RECONCILE_FIELDS)} /></MetadataEditorContext>);
      fireEvent.click(screen.getByRole("button", { name: "Choose subjects" }));
      const news = screen.getByRole("checkbox", { name: "news" }) as HTMLInputElement;
      expect(news.indeterminate).toBe(true);
      fireEvent.click(news);
      expect(editor.getState().saves.size).toBe(0);
      fireEvent.click(screen.getByRole("button", { name: "Cancel subject changes" }));
      fireEvent.click(screen.getByRole("button", { name: "Choose subjects" }));
      const reopened = screen.getByRole("checkbox", { name: "news" }) as HTMLInputElement;
      expect(reopened.indeterminate).toBe(true);
      fireEvent.click(reopened);
      fireEvent.click(screen.getByRole("button", { name: "Commit subject changes" }));
      expect([...editor.getState().saves.values()].at(-1)?.intent).toMatchObject({ fieldId: "metadata_subjects", action: "add", value: ["news"], targetIds: ids });
    } finally { editor.getState().dispose(); }
  });

  it("does not propagate legacy subjects or mistake a legacy-only source for a batch clear", () => {
    const from = (values: string[]) => metadataIntent("subjects", "overwrite", values, ["peer"]);
    expect(from(["legacy", "news"])).toMatchObject({ action: "add", value: ["news"] });
    expect(from(["legacy"])).toMatchObject({ action: "add", value: [] });
    expect(from([])).toMatchObject({ action: "overwrite", value: [] });
  });

  it("retains mixed field readings without edit authority while a deselection reconciles", () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const selected = ["North", "South", "South"].map((city, index) => ({ ...images[0], id: `stable-${index}`, metadata: { city, credit: city, keywords: ["shared", ...(index ? ["two"] : [])] }, userMetadata: { labels: ["shared", ...(index ? ["two"] : [])] } }));
    const grants = new Map(selected.map(image => [image.id, { resource: { links: [{ rel: "edits", href: `/metadata/${image.id}` }] } }]));
    const panel = (displayed: typeof selected, live: typeof selected, pending = false) => <MultiImageMetadata images={displayed} total={displayed.length}
      reconciledView={recomputeAll(displayed, RECONCILE_FIELDS)} retainedSnapshot={pending} labelEditing={{ targetIds: live.map(image => image.id), targets: grants, pending }} />;
    const { rerender } = render(panel(selected, selected));
    const reading = () => ["Credit", "Location"].map(field => fieldRow(field).textContent);
    const initial = reading(), remaining = selected.slice(1);
    rerender(panel(selected, remaining, true));
    expect(reading()).toEqual(initial);
    expect(fieldRow("People").querySelector('.metadata-add-tool:disabled')).toBeTruthy();
    for (const field of ["Keywords", "Labels"]) {
      const pills = fieldRow(field).querySelectorAll("[data-editable-pill]");
      expect([...pills].map(pill => pill.getAttribute("data-coverage"))).toEqual(["all", "partial"]);
      expect(fieldRow(field).querySelector('button[aria-label^="Apply shared"]')).toBeNull();
      expect(fieldRow(field).querySelector('.metadata-add-tool:disabled')).toBeTruthy();
    }
    for (const field of ["Credit", "Location"]) expect(screen.getByRole("button", { name: `Edit ${field}` }).matches(":disabled")).toBe(true);
    rerender(panel(remaining, remaining));
    expect(reading()).not.toEqual(initial);
    expect(fieldRow("Location").textContent).toContain("South");
  });

  it("keeps selected field rows and their reading content through a pending Credit publication", () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const selected = images.map((image, index) => ({ ...image, metadata: { description: "A longer caption", credit: "Old", keywords: index ? [] : ["City"] } }));
    const ids = selected.map(image => image.id);
    const reconciled = recomputeAll(selected, RECONCILE_FIELDS);
    reconciled.set("labels", { kind: "chip-array", total: ids.length, chips: [{ value: "News", count: 1 }, { value: "Shared", count: 2 }] });
    const editor = createMetadataEditorStore(vi.fn(), { readImages: vi.fn(), publishImages: vi.fn() });
    const view = (pending: boolean, targetIds = ids, revoked = false) => <MetadataEditorContext value={editor}><MultiImageMetadata images={selected} total={2}
      labelEditing={{ targetIds, targets: revoked ? new Map([[ids[0], { resource: { links: [] } }]]) : new Map(), pending }} reconciledView={reconciled} /></MetadataEditorContext>;
    try {
      const { container, rerender } = render(view(false));
      const headings = () => [...container.querySelectorAll("dt")].map(node => node.textContent);
      const before = headings();
      const addKeyword = screen.getByRole("button", { name: "Add keyword" });
      const city = screen.getByRole("button", { name: "Remove City from all selected images" });
      const label = screen.getByRole("button", { name: "Remove News from all selected images" });
      const shared = screen.getByRole("button", { name: "Remove Shared from all selected images" }).closest("[data-editable-pill]")!;
      const reading = () => ["People", "Collections", "Keywords", "Location"].map(label => fieldRow(label).textContent);
      const initialReading = reading();
      fireEvent.click(screen.getByRole("button", { name: "Edit Credit" }));
      fireEvent.change(screen.getByLabelText("Credit", { selector: "input" }), { target: { value: "New" } });
      fireEvent.click(screen.getByRole("button", { name: "Commit Credit" }));
      act(() => useEnrichmentStore.getState().setEnrichment(new Map()));
      rerender(view(true));
      expect(headings()).toEqual(before);
      expect(fieldRow("Credit").querySelector('form[data-field-state="Saving…"]')).toBeTruthy();
      const submitted = screen.getByLabelText("Credit", { selector: "input" }) as HTMLInputElement;
      expect(submitted.value).toBe("New");
      expect(submitted.matches(":disabled")).toBe(true);
      expect(reading()).toEqual(initialReading);
      expect(fieldRow("Description").textContent).toContain("A longer caption");
      expect(screen.getByRole("button", { name: "Edit Description" }).hasAttribute("disabled")).toBe(true);
      expect(screen.getByRole("button", { name: "Add keyword" }).hasAttribute("disabled")).toBe(false);
      expect(screen.getByRole("button", { name: "Remove City from all selected images" }).hasAttribute("disabled")).toBe(true);
      fireEvent.click(screen.getByRole("button", { name: "Apply City to all selected images" }));
      expect([...editor.getState().saves.values()].at(-1)?.intent).toMatchObject({ fieldId: "metadata_keywords", action: "add", value: "City", targetIds: ids });
      expect(screen.getByRole("button", { name: "Add label" }).hasAttribute("disabled")).toBe(false);
      fireEvent.click(screen.getByRole("button", { name: "Apply News to all selected images" }));
      expect([...editor.getState().saves.values()].at(-1)?.intent).toMatchObject({ fieldId: "labels", action: "add", value: "News", targetIds: ids });
      const save = [...editor.getState().saves.values()][0];
      act(() => editor.setState(state => ({ saves: new Map(state.saves).set(save.id, { ...save, state: "finished", items: ids.map(imageId => ({ imageId, state: "accepted-awaiting-visibility", observation: "observed" })) }) })));
      expect(fieldRow("Credit").textContent).toContain("New");
      expect(screen.queryByLabelText("Credit", { selector: "input" })).toBeNull();
      expect(headings()).toEqual(before);
      act(() => editor.setState({ panelSaves: [] }));
      rerender(view(true));
      expect(addKeyword.isConnected).toBe(true);
      expect(addKeyword.matches(":disabled")).toBe(true);
      expect(city.isConnected && city.matches(":disabled")).toBe(true);
      expect(label.isConnected && label.matches(":disabled")).toBe(true);
      expect(shared.isConnected && shared.getAttribute("data-coverage")).toBe("all");
      expect(addKeyword.closest("[data-retained-reading]")).not.toBeNull();
      expect(reading()).toEqual(initialReading);
      rerender(view(true, ids, true));
      expect(screen.queryByRole("button", { name: "Add keyword" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Add label" })).toBeNull();
      rerender(view(true, [ids[0], "different-image"]));
      expect(screen.queryByText("City")).toBeNull();
      expect(screen.getByRole("button", { name: "News" }).title).not.toContain("1/2");
    } finally { editor.getState().dispose(); }
  });

  it("preserves the original offset when editing the repeated local hour", () => {
    vi.stubEnv("TZ", "Europe/London");
    expect(new Date("2026-10-25T01:31").getTimezoneOffset()).toBe(-60);
    const prepare = vi.fn();
    const field = RECONCILE_FIELDS.find(field => field.id === "metadata_dateTaken")!;
    render(<dl><MetadataTextEditor field={field} targetIds={["first"]} value="2026-10-25T01:30:00Z" onPrepare={prepare}>Taken on</MetadataTextEditor></dl>);
    fireEvent.click(screen.getByRole("button", { name: "Edit Taken on" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Minutes" }), { target: { value: "31" } });
    fireEvent.click(screen.getByRole("button", { name: "Commit Taken on" }));
    expect(prepare).toHaveBeenCalledWith(expect.objectContaining({ value: "2026-10-25T01:31:00.000Z" }));
  });

  it.each(["single", "multiple"])("keeps upstream usage instructions read-only in %s metadata", context => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const populated = images.map(image => ({ ...image, metadata: { ...image.metadata, usageInstructions: "Upstream restrictions", specialInstructions: "" } }));
    render(context === "single" ? <ImageMetadata image={populated[0]} />
      : <MultiImageMetadata images={populated} reconciledView={recomputeAll(populated, RECONCILE_FIELDS)} total={2} />);
    expect(screen.queryByText("Upstream restrictions")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Edit Usage instructions" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit Special instructions" }));
    expect((screen.getByLabelText("Special instructions") as HTMLTextAreaElement).value).toBe("");
    expect(screen.getByText("Upstream restrictions")).toBeTruthy();
  });

  it("places metadata suggestions outside the heading and action row in either direction", () => {
    vi.spyOn(typeahead, "buildTypeaheadFields").mockReturnValue([{ fieldName: "credit", resolver: ["Reuters"] }]);
    let editorBounds = new DOMRect(100, 80, 260, 160);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.hasAttribute("data-metadata-field")) return editorBounds;
      if (this instanceof HTMLInputElement) return new DOMRect(180, editorBounds.top + 30, 150, 30);
      return new DOMRect();
    });
    const field = RECONCILE_FIELDS.find(field => field.id === "metadata_credit")!;
    render(<dl><MetadataTextEditor field={field} targetIds={["first"]} value="">Empty</MetadataTextEditor></dl>);
    fireEvent.click(screen.getByRole("button", { name: "Edit Credit" }));
    const list = screen.getByRole("listbox", { name: "Suggestions for Credit" });
    expect(Number.parseFloat(list.style.top)).toBe(editorBounds.bottom + 6);
    expect(list.style.transform).toBe("");
    editorBounds = new DOMRect(100, window.innerHeight - 140, 260, 120);
    fireEvent(window, new Event("resize"));
    expect(Number.parseFloat(list.style.top)).toBe(editorBounds.top - 6);
    expect(list.style.transform).toBe("translateY(-100%)");
    editorBounds = new DOMRect(100, -100, 260, window.innerHeight + 200);
    fireEvent(window, new Event("resize"));
    const input = screen.getByLabelText("Credit") as HTMLInputElement;
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(input.getAttribute("aria-expanded")).toBe("false");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input.value).toBe("");
    expect(input.getAttribute("aria-activedescendant")).toBeNull();
  });

  it("dismisses scalar suggestions before cancelling and leaves modified Enter to the editor", () => {
    vi.spyOn(typeahead, "buildTypeaheadFields").mockReturnValue([{ fieldName: "credit", resolver: ["BBC", "Reuters"] }]);
    const prepare = vi.fn();
    const field = RECONCILE_FIELDS.find(field => field.id === "metadata_credit")!;
    render(<dl><MetadataTextEditor field={field} targetIds={["first"]} value="Original credit" onPrepare={prepare}>Original credit</MetadataTextEditor></dl>);
    fireEvent.click(screen.getByRole("button", { name: "Edit Credit" }));
    const input = screen.getByLabelText("Credit") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "R" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByLabelText("Credit")).not.toBeNull();
    expect(input.value).toBe("R");
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.change(input, { target: { value: "Re" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
    expect(prepare).toHaveBeenCalledWith(expect.objectContaining({ fieldId: "metadata_credit", value: "Re" }));
  });

  it("normalizes Photoshoot before deciding whether a commit changes anything", () => {
    const prepare = vi.fn();
    const field = RECONCILE_FIELDS.find(field => field.id === "photoshoot")!;
    render(<dl><MetadataTextEditor field={field} targetIds={["first"]} value="Assignment" onPrepare={prepare}>Assignment</MetadataTextEditor></dl>);
    fireEvent.click(screen.getByRole("button", { name: "Edit Photoshoot" }));
    fireEvent.change(screen.getByLabelText("Photoshoot"), { target: { value: " Assignment " } });
    expect(screen.getByRole("button", { name: "Commit Photoshoot" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("Photoshoot"), { target: { value: " Another assignment " } });
    fireEvent.click(screen.getByRole("button", { name: "Commit Photoshoot" }));
    expect(prepare).toHaveBeenCalledWith(expect.objectContaining({ fieldId: "photoshoot", value: "Another assignment" }));
  });

  it("distinguishes mixed image types from explicitly clearing their override", () => {
    const types = [...gridConfig.imageTypes];
    gridConfig.imageTypes.splice(0, gridConfig.imageTypes.length, "Photograph", "Illustration");
    try {
      const prepare = vi.fn();
      const field = RECONCILE_FIELDS.find(field => field.id === "metadata_imageType")!;
      render(<dl><MetadataTextEditor field={field} targetIds={["first", "second"]} value="" mixed onPrepare={prepare}>Multiple image types</MetadataTextEditor></dl>);
      fireEvent.click(screen.getByRole("button", { name: "Edit Image type" }));
      const input = screen.getByLabelText("Image type") as HTMLSelectElement;
      expect(within(input).queryByRole("option", { name: "Multiple image types" })).not.toBeNull();
      const unknown = within(input).getByRole("option", { name: "Unknown" }) as HTMLOptionElement;
      fireEvent.change(input, { target: { value: unknown.value } });
      expect(screen.getByRole("button", { name: "Commit Image type" }).hasAttribute("disabled")).toBe(false);
      fireEvent.click(screen.getByRole("button", { name: "Commit Image type" }));
      expect(prepare).toHaveBeenCalledWith(expect.objectContaining({ fieldId: "metadata_imageType", value: "" }));
    } finally { gridConfig.imageTypes.splice(0, gridConfig.imageTypes.length, ...types); }
  });

  it("keeps explicit scalar and component clears when passing through mixed values", () => {
    const prepare = vi.fn();
    const field = RECONCILE_FIELDS.find(field => field.id === "metadata_credit")!;
    const view = (ids: string[], value: string) => <DetailsDrafts><dl key={ids.join()}>
      <MetadataTextEditor field={field} targetIds={ids} value={value} mixed={ids.length > 1} onPrepare={prepare}>Credit</MetadataTextEditor>
      <MetadataLocationEditor fields={LOCATION_COMPONENTS.map(part => ({ ...part, value: part.key === "city" ? value : "", mixed: part.key === "city" && ids.length > 1 }))}
        targetIds={ids} available onPrepare={prepare}>Location</MetadataLocationEditor></dl></DetailsDrafts>;
    const { rerender } = render(view(["first"], "First"));
    for (const name of ["Credit", "Location"]) fireEvent.click(screen.getByRole("button", { name: `Edit ${name}` }));
    for (const name of ["Credit", "City"]) fireEvent.change(screen.getByLabelText(name), { target: { value: "" } });
    rerender(view(["first", "second"], ""));
    rerender(view(["second"], "Second"));
    for (const name of ["Credit", "Location"]) fireEvent.click(screen.getByRole("button", { name: `Commit ${name}` }));
    expect(prepare.mock.calls.map(([intent]) => [intent.targetIds, intent.value])).toEqual([[["second"], ""], [["second"], { city: "" }]]);
  });

  it("keeps Location input while selected metadata is temporarily pending", () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const selected = images.map((image, index) => ({ ...image, metadata: { ...image.metadata, city: index ? "Paris" : "London", country: "United Kingdom" } }));
    const view = (pending: boolean) => <MultiImageMetadata images={selected} total={2}
      reconciledView={pending ? null : recomputeAll(selected, RECONCILE_FIELDS)}
      labelEditing={{ targetIds: selected.map(image => image.id), targets: new Map(), pending }} />;
    const { rerender } = render(view(false));
    expect(within(fieldRow("Location")).getByRole("button", { name: "Edit all Location" })).toBeTruthy();
    expect(within(fieldRow("Location")).getByText("all", { selector: "strong" })).toBeTruthy();
    fireEvent.click(within(fieldRow("Location")).getByRole("button", { name: "United Kingdom" }));
    expect(screen.queryByLabelText("City")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit Location" }));
    expect(screen.getByLabelText("Sublocation").getAttribute("placeholder")).toBe("or place");
    expect(screen.getByLabelText("State").getAttribute("placeholder")).toBe("or region");
    expect(screen.getByLabelText("City").getAttribute("placeholder")).toBe("Multiple cities");
    fireEvent.change(screen.getByLabelText("City"), { target: { value: "Draft city" } });
    rerender(view(true));
    expect((screen.getByLabelText("City") as HTMLInputElement).value).toBe("Draft city");
    expect(screen.getByRole("button", { name: "Commit Location" }).hasAttribute("disabled")).toBe(true);
    rerender(view(false));
    expect((screen.getByLabelText("City") as HTMLInputElement).value).toBe("Draft city");
  });

  it("prepares only changed Location components, preserving untouched shared and mixed values", () => {
    const prepare = vi.fn();
    const fields = LOCATION_COMPONENTS.map(field => ({ ...field, value: field.key === "subLocation" ? "Picture desk" : field.key === "country" ? "United Kingdom" : "", mixed: field.key === "city" || field.key === "state" }));
    render(<dl><MetadataLocationEditor fields={fields} targetIds={["first", "second"]} available onPrepare={prepare}>Multiple cities</MetadataLocationEditor></dl>);
    fireEvent.click(screen.getByRole("button", { name: "Edit Location" }));
    const first = screen.getByLabelText("Sublocation") as HTMLInputElement;
    expect(first.selectionStart).toBe(first.value.length);
    expect(screen.queryByRole("button", { name: "Clear Location" })).toBeNull();
    expect(screen.getByRole("button", { name: "Commit Location" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("City"), { target: { value: "London" } });
    fireEvent.keyDown(screen.getByLabelText("City"), { key: "Enter" });
    expect(prepare).toHaveBeenCalledWith({ fieldId: "location", action: "overwrite", value: { city: "London" }, targetIds: ["first", "second"] });
    expect(useToastStore.getState().queue.at(-1)?.message).toBe("Not sent - Location change prepared for 2 images.");
    fireEvent.click(screen.getByRole("button", { name: "Cancel Location" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit Location" }));
    expect(screen.queryByRole("button", { name: "Clear City" })).not.toBeNull();
    const clearCity = screen.getByRole("button", { name: "Clear City" });
    prepare.mockClear();
    expect(fireEvent.keyDown(clearCity, { key: "Enter" })).toBe(true);
    expect(prepare).not.toHaveBeenCalled();
    fireEvent.click(clearCity);
    expect(screen.getByLabelText("City").getAttribute("placeholder")).toBeNull();
    expect(screen.getByLabelText("State").getAttribute("placeholder")).toBe("Multiple states");
    fireEvent.click(screen.getByRole("button", { name: "Commit Location" }));
    expect(prepare).toHaveBeenLastCalledWith(expect.objectContaining({ fieldId: "location", value: { city: "" } }));
  });

  it("uses configured image types and date segments without changing the stored instant on entry", () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const types = [...gridConfig.imageTypes];
    gridConfig.imageTypes.splice(0, gridConfig.imageTypes.length, "Photograph", "Illustration");
    try {
      const dateTaken = "2026-11-10T11:22:33.123Z";
      const populated = images.map(image => ({ ...image, metadata: { ...image.metadata, dateTaken, imageType: "Photograph" },
        userMetadata: { ...image.userMetadata, photoshoot: { title: "Assignment" } } }));
      render(<MultiImageMetadata images={populated} reconciledView={recomputeAll(populated, RECONCILE_FIELDS)} total={2} />);
      fireEvent.click(screen.getByRole("button", { name: "Edit Image type" }));
      expect((within(screen.getByLabelText("Image type")).getByRole("option", { name: "Photograph" }) as HTMLOptionElement).selected).toBe(true);
      expect(screen.getByRole("button", { name: "Commit Image type" }).hasAttribute("disabled")).toBe(true);
      fireEvent.click(screen.getByRole("button", { name: "Edit Taken on" }));
      const input = screen.getByRole("group", { name: "Taken on" });
      expect((screen.getByRole("textbox", { name: "Milliseconds" }) as HTMLInputElement).value).toBe("123");
      expect(screen.getByRole("button", { name: "Commit Taken on" }).hasAttribute("disabled")).toBe(true);
      fireEvent.change(screen.getByRole("textbox", { name: "Day" }), { target: { value: "32" } });
      expect(input.getAttribute("aria-invalid")).toBe("true");
      expect(screen.getByRole("alert").textContent).toContain("date and time");
      fireEvent.click(screen.getByRole("button", { name: "Edit Photoshoot" }));
      expect((screen.getByLabelText("Photoshoot") as HTMLInputElement).value).toBe("Assignment");
      expect(screen.getByRole("button", { name: "Add person" })).toBeTruthy();
    } finally { gridConfig.imageTypes.splice(0, gridConfig.imageTypes.length, ...types); }
  });

  it("prepares date changes and fractions but refuses button, calendar and keyboard clearing", () => {
    const prepare = vi.fn();
    const field = RECONCILE_FIELDS.find(field => field.id === "metadata_dateTaken")!;
    const original = "2026-11-10T11:22:33.123Z";
    render(<dl><MetadataTextEditor field={field} targetIds={["first"]} value={original} onPrepare={prepare}>10 Nov 2026 11:22</MetadataTextEditor></dl>);
    fireEvent.click(screen.getByRole("button", { name: "Edit Taken on" }));
    const calendar = screen.getByLabelText("Taken on calendar") as HTMLInputElement;
    expect(calendar.step).toBe("1");
    expect(new Date(calendar.value).getMilliseconds()).toBe(0);
    const expected = new Date(original);
    expected.setDate(expected.getDate() + 1); expected.setMilliseconds(0);
    fireEvent.change(screen.getByRole("textbox", { name: "Day" }), { target: { value: String(expected.getDate()) } });
    expect((screen.getByRole("textbox", { name: "Milliseconds" }) as HTMLInputElement).value).toBe("000");
    fireEvent.click(screen.getByRole("button", { name: "Commit Taken on" }));
    expect(prepare).toHaveBeenLastCalledWith(expect.objectContaining({ value: expected.toISOString() }));
    fireEvent.change(screen.getByRole("textbox", { name: "Milliseconds" }), { target: { value: "456" } });
    expected.setMilliseconds(456);
    fireEvent.click(screen.getByRole("button", { name: "Commit Taken on" }));
    expect(prepare).toHaveBeenLastCalledWith(expect.objectContaining({ value: expected.toISOString() }));
    fireEvent.change(screen.getByRole("textbox", { name: "Year" }), { target: { value: "2" } });
    expect(screen.getByRole("button", { name: "Commit Taken on" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Clear Taken on" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Clear Taken on" }));
    fireEvent.click(screen.getByRole("button", { name: "Commit Taken on" }));
    expect(prepare).toHaveBeenCalledTimes(2);
    fireEvent.change(calendar, { target: { value: "2026-11-12T10:20:30" } });
    expect((screen.getByRole("textbox", { name: "Milliseconds" }) as HTMLInputElement).value).toBe("000");
    fireEvent.change(calendar, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Commit Taken on" }));
    expect(prepare).toHaveBeenLastCalledWith(expect.objectContaining({ value: new Date("2026-11-12T10:20:30").toISOString() }));
    fireEvent.change(calendar, { target: { value: "2026-11-12T10:20:30" } });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Day" }), { key: "a", ctrlKey: true });
    const minutes = screen.getByRole("textbox", { name: "Minutes" });
    fireEvent.pointerDown(minutes);
    fireEvent.focus(minutes);
    fireEvent.keyDown(minutes, { key: "Backspace" });
    expect((screen.getByRole("textbox", { name: "Year" }) as HTMLInputElement).value).toBe("2026");
    fireEvent.keyDown(minutes, { key: "a", ctrlKey: true });
    fireEvent.keyDown(minutes, { key: "Backspace" });
    expect((screen.getByRole("textbox", { name: "Year" }) as HTMLInputElement).value).toBe("2026");
    for (const label of ["Day", "Month", "Year", "Hours", "Minutes", "Seconds", "Milliseconds"]) {
      fireEvent.change(screen.getByRole("textbox", { name: label }), { target: { value: "" } });
    }
    expect(screen.getByRole("button", { name: "Commit Taken on" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Commit Taken on" }));
    expect(prepare).toHaveBeenCalledTimes(3);
    fireEvent.click(screen.getByRole("button", { name: "Cancel Taken on" }));
    expect(screen.getByText("10 Nov 2026 11:22")).toBeTruthy();
  });

  it("keeps mixed date segments through pending reads without treating partial input as clearing", () => {
    const prepare = vi.fn();
    const field = RECONCILE_FIELDS.find(field => field.id === "metadata_dateTaken")!;
    const view = (available: boolean) => <dl><MetadataTextEditor field={field} targetIds={["first", "second"]} value="" mixed available={available} onPrepare={prepare}>Multiple dates</MetadataTextEditor></dl>;
    const { rerender } = render(view(true));
    fireEvent.click(screen.getByRole("button", { name: "Edit Taken on" }));
    expect(screen.getByRole("group", { name: "Taken on" }).textContent).toContain("Multiple dates");
    expect(screen.queryByRole("textbox", { name: "Day" })).toBeNull();
    expect(screen.getByRole("button", { name: "Clear Taken on" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Clear Taken on" }));
    expect(screen.getByRole("group", { name: "Taken on" }).textContent).toContain("Multiple dates");
    expect(screen.getByRole("button", { name: "Commit Taken on" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Commit Taken on" }));
    expect(prepare).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel Taken on" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit Taken on" }));
    fireEvent.click(screen.getByRole("button", { name: "Multiple dates" }));
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Day" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Day" }), { target: { value: "1" } });
    expect(screen.getByRole("group", { name: "Taken on" }).textContent).not.toContain("Multiple dates");
    rerender(view(false));
    expect((screen.getByRole("textbox", { name: "Day" }) as HTMLInputElement).value).toBe("1");
    rerender(view(true));
    expect(screen.getByRole("button", { name: "Commit Taken on" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Clear Taken on" }));
    fireEvent.click(screen.getByRole("button", { name: "Commit Taken on" }));
    expect(prepare).not.toHaveBeenCalled();
  });

  it("offers ordinary editable text fields without making Source editable", () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const populated = images.map(image => ({ ...image, metadata: { ...image.metadata,
      byline: "Picture desk", specialInstructions: "Handle with care", copyright: "Picture desk", source: "Imported" } }));
    render(<MultiImageMetadata images={populated} reconciledView={recomputeAll(populated, RECONCILE_FIELDS)} total={2} />);
    for (const name of ["By", "Special instructions", "Copyright"]) {
      fireEvent.click(screen.getByRole("button", { name: `Edit ${name}` }));
      const input = screen.getByLabelText(name) as HTMLInputElement | HTMLTextAreaElement;
      expect(input.getAttribute("role")).toBeNull();
      expect(input.selectionStart).toBe(input.value.length);
      expect(input.selectionEnd).toBe(input.value.length);
      fireEvent.click(screen.getByRole("button", { name: `Cancel ${name}` }));
    }
    expect(screen.queryByRole("button", { name: "Edit Source" })).toBeNull();
  });

  it("keeps empty Title disabled but permits blank mixed Description overwrite, not empty additions", () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const mixed = images.map((image, index) => ({ ...image, metadata: { ...image.metadata, title: "", description: `Description ${index}`, byline: `Byline ${index}` } }));
    render(<MultiImageMetadata images={mixed} reconciledView={recomputeAll(mixed, RECONCILE_FIELDS)} total={2} />);
    expect(screen.getByRole("button", { name: "Edit Title" }).closest("dt")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit Title" }));
    expect(screen.getByRole("button", { name: "Commit Title" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("textbox", { name: "Title" }).getAttribute("placeholder")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit By" }));
    expect(screen.getByRole("textbox", { name: "By" }).getAttribute("placeholder")).toBe("Multiple bylines");
    fireEvent.click(screen.getByRole("button", { name: "Edit Description" }));
    expect((screen.getByRole("textbox", { name: "Description" }) as HTMLTextAreaElement).value).toBe("");
    expect(screen.getByRole("textbox", { name: "Description" }).getAttribute("placeholder")).toBe("Multiple descriptions");
    expect((screen.getByRole("radio", { name: "Overwrite" }) as HTMLInputElement).checked).toBe(true);
    const commit = screen.getByRole("button", { name: "Commit Description" });
    expect(commit.hasAttribute("disabled")).toBe(false);
    expect(screen.queryByRole("button", { name: "Clear Description" })).toBeNull();
    for (const name of ["Add before", "Add after"]) {
      fireEvent.click(screen.getByRole("radio", { name }));
      expect(commit.hasAttribute("disabled")).toBe(true);
      expect(screen.getByRole("textbox", { name: "Description" }).getAttribute("placeholder")).toBeNull();
    }
    fireEvent.click(screen.getByRole("radio", { name: "Overwrite" }));
    fireEvent.click(commit);
    expect(useToastStore.getState().queue.at(-1)?.message).toBe("Not sent - Description change prepared for 2 images.");
    fireEvent.click(screen.getByRole("button", { name: "Cancel Description" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit Description" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Description" }), { target: { value: "New description" } });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Description" }), { key: "Enter" });
    expect(useToastStore.getState().queue).toHaveLength(1);
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Description" }), { key: "Enter", metaKey: true });
    expect(useToastStore.getState().queue).toHaveLength(2);
  });

  it.each(["single", "multiple", "form"])("uses the image's collection action, independently of edits, in %s metadata", context => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const selected = images.map(image => ({ ...image, collections: [] }));
    const publish = (add: boolean) => useEnrichmentStore.getState().setEnrichment(new Map(selected.map(image => {
      const overlay = { resource: { links: add ? [] : [{ rel: "edits", href: "/metadata/fixture" }] },
        actions: add ? [{ name: "add-collection", method: "POST" as const, href: "/collections/fixture" }] : [] };
      stampImageRead(image, overlay, captureImageRead(), "lean");
      attachEnrichment(image, overlay);
      return [image.id, overlay];
    })));
    publish(true);
    const mounted = render(context === "multiple" ? <MultiImageMetadata images={selected} total={selected.length} reconciledView={recomputeAll(selected, RECONCILE_FIELDS)} /> :
      <ImageMetadata image={selected[0]} formFields={context === "form" ? new Set(["collections"]) : undefined} />);
    const plus = screen.getByRole("button", { name: "Add collection" }) as HTMLButtonElement;
    expect(plus.disabled).toBe(false);
    if (context !== "form") {
      expect(typeof admitLabelObservation(selected.map(image => image.id))).toBe("number");
      mounted.rerender(context === "single" ? <ImageMetadata image={selected[0]} /> : <MultiImageMetadata images={selected} total={2} reconciledView={recomputeAll(selected, RECONCILE_FIELDS)} />);
      expect(plus.isConnected && plus.disabled).toBe(true);
      expect(screen.queryByRole("button", { name: "Edit Credit" })).toBeNull();
    }
    if (context === "multiple") {
      mounted.rerender(<MultiImageMetadata images={selected} total={selected.length} reconciledView={recomputeAll(selected, RECONCILE_FIELDS)}
        labelEditing={{ targetIds: selected.map(image => image.id), targets: new Map(), pending: true }} />);
      expect(plus.isConnected && plus.disabled).toBe(true);
      expect(plus.closest("[data-retained-reading]")).not.toBeNull();
    }
    act(() => publish(false));
    expect(screen.queryByText("Collections", { selector: "dt" })).toBeNull();
    if (context === "multiple") {
      mounted.rerender(<MultiImageMetadata images={selected} total={selected.length} reconciledView={null}
        labelEditing={{ targetIds: selected.map(image => image.id), targets: new Map(), pending: true }} />);
      expect(screen.queryByText("Collections", { selector: "dt" })).toBeNull();
    }
  });

  it("prepares collection removal without changing canonical memberships", () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const selected = images.map((image, index) => ({ ...image, collections: index ? [] : [{ pathId: "editorial/news", path: ["Editorial", "News"] }] }));
    act(() => useEnrichmentStore.getState().upsertEnrichment(new Map([[selected[0].id, {
      ...useEnrichmentStore.getState().data.get(selected[0].id), removableCollections: new Set(["editorial/news"]),
    }]])));
    render(<MultiImageMetadata images={selected} reconciledView={recomputeAll(selected, RECONCILE_FIELDS)} total={2} />);
    const row = fieldRow("Collections");
    expect(within(row).getByRole("button", { name: "Add collection" }).closest("dt")).not.toBeNull();
    expect(row.querySelector("dd")?.contains(within(row).getByRole("button", { name: "Remove editorial/news from all selected images" }))).toBe(true);
    expect(within(row).getByText("Editorial")).toBeTruthy();
    expect(within(row).getByText("News")).toBeTruthy();
    fireEvent.click(within(row).getByRole("button", { name: "Remove editorial/news from all selected images" }));
    expect(useToastStore.getState().queue.at(-1)?.message).toBe("Not sent - Remove collection prepared for 1 image.");
    expect(selected[0].collections).toHaveLength(1);
    expect(within(row).getByRole("button", { name: "Apply editorial/news to all selected images" }).title).toContain("all 2 images");
    const overlay = useEnrichmentStore.getState().data.get(selected[0].id)!;
    act(() => useEnrichmentStore.getState().upsertEnrichment(new Map([[selected[0].id, { ...overlay, actions: [], removableCollections: undefined }]])));
    const inRow = within(fieldRow("Collections"));
    expect((inRow.getByRole("button", { name: "Add collection" }) as HTMLButtonElement).disabled).toBe(true);
    expect((inRow.getByRole("button", { name: "Remove editorial/news from all selected images" }) as HTMLButtonElement).disabled).toBe(true);
    expect((inRow.getByRole("button", { name: "Apply editorial/news to all selected images" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(inRow.getByRole("button", { name: "Apply editorial/news to all selected images" }));
    expect(useToastStore.getState().queue.at(-1)?.message).toBe("Not sent - Add collection prepared for 1 image.");
    fireEvent.click(screen.getByRole("button", { name: "Add keyword" }));
    fireEvent.change(screen.getByRole("combobox", { name: "New keyword" }), { target: { value: "shared" } });
    expect(screen.getByRole("button", { name: "Commit new keyword" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel new keyword" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Add keyword" }));
  });

  it("keeps Description mode drafts separate and permits clearing shared text without sending", () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const shared = images.map(image => ({ ...image, metadata: { ...image.metadata, description: "Shared description" } }));
    const renderView = (pending = false, selected = shared) => <DetailsDrafts><MultiImageMetadata images={selected} reconciledView={recomputeAll(selected, RECONCILE_FIELDS)} total={selected.length}
      labelEditing={{ targetIds: selected.map(image => image.id), targets: new Map(), pending }} /></DetailsDrafts>;
    const { rerender } = render(renderView());
    fireEvent.click(screen.getByRole("button", { name: "Edit Description" }));
    let input = screen.getByRole("textbox", { name: "Description" }) as HTMLTextAreaElement;
    const unloadAllowed = () => window.dispatchEvent(new Event("beforeunload", { cancelable: true }));
    expect(unloadAllowed()).toBe(true);
    expect(input.value).toBe("Shared description");
    expect(input.selectionStart).toBe(input.value.length);
    expect(input.selectionEnd).toBe(input.value.length);
    expect(screen.queryByRole("radio", { name: "Overwrite" })).toBeNull();
    let commit = screen.getByRole("button", { name: "Commit Description" });
    expect(commit.hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Add before" }));
    expect(input.value).toBe("");
    expect(commit.hasAttribute("disabled")).toBe(true);
    fireEvent.change(input, { target: { value: "Prefix" } });
    expect(unloadAllowed()).toBe(false);
    rerender(<DetailsDrafts><ImageMetadata image={shared[1]} /></DetailsDrafts>);
    expect((screen.getByRole("textbox", { name: "Description" }) as HTMLTextAreaElement).value).toBe("Prefix");
    expect(screen.getByRole("button", { name: "Add before" }).getAttribute("aria-pressed")).toBe("true");
    rerender(renderView(false, [shared[1], { ...shared[0], id: "third" }]));
    expect((screen.getByRole("textbox", { name: "Description" }) as HTMLTextAreaElement).value).toBe("Prefix");
    rerender(renderView(true));
    input = screen.getByRole("textbox", { name: "Description" }) as HTMLTextAreaElement;
    commit = screen.getByRole("button", { name: "Commit Description" });
    expect((screen.getByRole("textbox", { name: "Description" }) as HTMLTextAreaElement).value).toBe("Prefix");
    expect(commit.hasAttribute("disabled")).toBe(true);
    rerender(renderView());
    fireEvent.click(screen.getByRole("button", { name: "Add after" }));
    expect(input.value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Add before" }));
    expect(input.value).toBe("Prefix");
    fireEvent.click(screen.getByRole("button", { name: "Add before" }));
    expect(input.value).toBe("Shared description");
    fireEvent.change(input, { target: { value: "" } });
    expect(commit.hasAttribute("disabled")).toBe(false);
    fireEvent.click(commit);
    expect(useToastStore.getState().queue.at(-1)?.message).toBe("Not sent - Description change prepared for 2 images.");
    expect(shared.every(image => image.metadata.description === "Shared description")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel Description" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit Description" }));
    expect(unloadAllowed()).toBe(true);
  });
});

describe("disconnected label editing", () => {
  it("does not cancel label input when Escape dismisses an IME candidate", () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const store = createLabelEditorStore();
    const targetIds = ["first"];
    try {
      render(<dl><LabelEditorContext value={store}><LabelEditor context={{ targetIds, targets: new Map([["first", {
        resource: { links: [{ rel: "edits", href: "https://metadata.example.test/metadata/first" }] },
      }]]) }} values={[]} onSearch={vi.fn()} /></LabelEditorContext></dl>);
      fireEvent.click(screen.getByRole("button", { name: "Add label" }));
      const input = screen.getByRole("combobox", { name: "Add label" });
      fireEvent.change(input, { target: { value: "IME draft" } });
      fireEvent.keyDown(input, { key: "Escape", isComposing: true });
      expect(store.getState().drafts.get(labelTargetKey(targetIds))?.value).toBe("IME draft");
    } finally { store.getState().dispose(); }
  });

  it("bounds overlapping bulk submissions and lets a waiting operation be stopped", async () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    let release!: (result: GridCommandResult) => void;
    const executor = vi.fn().mockImplementationOnce(() => new Promise<GridCommandResult>(resolve => { release = resolve; }))
      .mockResolvedValue({ outcome: "rejected", status: 403, errorKey: "permission-denied" });
    const store = createLabelEditorStore(executor, undefined, "connected");
    const context = (imageId: string) => ({ targetIds: [imageId], targets: new Map([[imageId, {
      resource: { links: [{ rel: "edits", href: `https://metadata.example.test/metadata/${imageId}` }] },
    }]]) });
    try {
      expect(store.getState().prepare("add", "first", context("first"))).toBe(true);
      recordImageAvailability(["unavailable"], "unavailable");
      expect(store.getState().prepare("add", "unavailable", context("unavailable"))).toBe(false);
      expect(store.getState().prepare("add", "invalid", context("invalid/id"))).toBe(false);
      expect(store.getState().prepare("add", "second", context("second"))).toBe(true);
      expect(store.getState().prepare("add", "third", context("third"))).toBe(false);
      expect(store.getState().refusal).toBe("busy");
      expect(executor).toHaveBeenCalledTimes(1);
      expect(store.getState().receipts[1].items[0].state).toBe("queued");
      render(<LabelEditorContext value={store}><EditLifecycle /></LabelEditorContext>);
      expect(window.dispatchEvent(new Event("beforeunload", { cancelable: true }))).toBe(false);
      expect(screen.queryByRole("button", { name: "Stop remaining" })).toBeNull();
      act(() => store.getState().stopRemaining(1));
      expect(store.getState().receipts[1].items[0].state).toBe("stopped");
      await act(async () => { release({ outcome: "unknown" }); });
      expect(executor).toHaveBeenCalledTimes(1);
      expect(store.getState().receipts[0].items[0].state).toBe("unknown");
      expect(store.getState().prepare("add", "second", context("second"))).toBe(true);
      expect(store.getState().receipts).toHaveLength(3);
    } finally { store.getState().dispose(); release?.({ outcome: "unknown" }); }
  });

  it("refuses oversized actual membership before consulting target metadata", () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const executor = vi.fn();
    const store = createLabelEditorStore(executor, undefined, "connected");
    const targets = new Map();
    const getTarget = vi.spyOn(targets, "get");
    expect(store.getState().prepare("add", "news", {
      targetIds: Array.from({ length: BATCH_POLICY.maxTouchedImages + 1 }, (_, index) => `image-${index}`), targets,
    })).toBe(false);
    expect(store.getState().refusal).toBe("freshness-capacity");
    expect(getTarget).not.toHaveBeenCalled();
    expect(executor).not.toHaveBeenCalled();
    render(<LabelEditorContext value={store}><MultiImageMetadata images={images} total={101}
      reconciledView={recomputeAll(images, RECONCILE_FIELDS)} labelEditing={{
        targetIds: Array.from({ length: 101 }, (_, index) => `image-${index}`), targets,
      }} /></LabelEditorContext>);
    expect(screen.queryByText(/at most 100 images/)).toBeNull();
    expect(screen.getByRole("button", { name: "Add label" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Edit Title" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Add keyword" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Add collection" }).hasAttribute("disabled")).toBe(true);
    store.getState().dispose();
  });

  it("records the connected target failure beyond the first eight images", async () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    vi.useFakeTimers();
    const executor = vi.fn(async (command: LabelCommand): Promise<GridCommandResult> => command.imageId === "image-8"
      ? { outcome: "rejected", status: 403, errorKey: "ninth-rejection" } : { outcome: "acknowledged" });
    const store = createLabelEditorStore(executor, undefined, "connected");
    const ids = Array.from({ length: 9 }, (_, index) => `image-${index}`);
    try {
      store.getState().prepare("add", "news", { targetIds: ids, targets: new Map(ids.map(imageId => [imageId, {
        resource: { links: [{ rel: "edits", href: `https://metadata.example.test/metadata/${imageId}` }] },
      }])) });
      await vi.advanceTimersByTimeAsync(2_000);
      expect(store.getState().receipts[0].items[8]).toMatchObject({ imageId: "image-8", state: "rejected", result: { errorKey: "ninth-rejection" } });
    } finally { store.getState().dispose(); vi.useRealTimers(); }
  });

  it("shares observation admission and pacing across editor owners without disposing their shared queue", async () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    vi.useFakeTimers();
    let release!: (images: Image[]) => void;
    const executor = vi.fn().mockResolvedValueOnce({ outcome: "acknowledged" })
      .mockResolvedValue({ outcome: "rejected", status: 403, errorKey: "permission-denied" });
    const readImages = vi.fn(() => new Promise<Image[]>(resolve => { release = resolve; }));
    const publishImages = vi.fn();
    const queue = createBatchQueue();
    const store = createLabelEditorStore(executor, { readImages, publishImages }, "connected", queue);
    const other = createLabelEditorStore(executor, undefined, "connected", queue);
    const context = (imageId: string) => ({ targetIds: [imageId], targets: new Map([[imageId, {
      resource: { links: [{ rel: "edits", href: `https://metadata.example.test/metadata/${imageId}` }] },
    }]]) });
    try {
      store.getState().prepare("add", "news", context(images[0].id));
      expect(other.getState().prepare("add", "news", context(images[1].id))).toBe(true);
      expect(other.getState().receipts[0].items[0].state).toBe("queued");
      await vi.advanceTimersByTimeAsync(100);
      expect(executor).toHaveBeenCalledTimes(1);
      release([{ ...images[0], userMetadata: { labels: ["news"] } }]);
      await vi.advanceTimersByTimeAsync(0);
      expect(publishImages).toHaveBeenCalledTimes(1);
      expect(executor).toHaveBeenCalledTimes(2);
      expect(store.getState().receipts[0].items[0].state).toBe("accepted-awaiting-visibility");
      expect(other.getState().receipts[0].items[0].state).toBe("rejected");
      store.getState().dispose();
      expect(other.getState().prepare("add", "later", context(images[1].id))).toBe(true);
      await vi.advanceTimersByTimeAsync(250);
      expect(executor).toHaveBeenCalledTimes(3);
    } finally { store.getState().dispose(); other.getState().dispose(); queue.dispose(); release?.([]); vi.useRealTimers(); }
  });

  it("keeps a sibling queued while a disposed owner's dispatched mutation is still unresolved", async () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    vi.useFakeTimers();
    const releases: ((result: GridCommandResult) => void)[] = [];
    const executor = vi.fn((command: LabelCommand) => command.imageId.startsWith("held")
      ? new Promise<GridCommandResult>(resolve => { releases.push(resolve); })
      : Promise.resolve({ outcome: "rejected" as const, status: 403, errorKey: "permission-denied" }));
    const queue = createBatchQueue();
    const observation = { readImages: vi.fn(), publishImages: vi.fn() };
    const owner = createLabelEditorStore(executor, observation, "connected", queue);
    const sibling = createLabelEditorStore(executor, observation, "connected", queue);
    const context = (targetIds: string[]) => ({ targetIds, targets: new Map(targetIds.map(imageId => [imageId, {
      resource: { links: [{ rel: "edits", href: `https://metadata.example.test/metadata/${imageId}` }] },
    }])) });
    try {
      const held = Array.from({ length: 8 }, (_, index) => `held-${index}`);
      expect(owner.getState().prepare("add", "news", context([...held, "unsent"]))).toBe(true);
      expect(sibling.getState().prepare("add", "news", context(["sibling"]))).toBe(true);
      owner.getState().dispose();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(executor.mock.calls.map(([command]) => command.imageId)).toEqual(held);
      expect(owner.getState().receipts[0].items).toMatchObject([
        ...held.map(() => ({ state: "submitted", observation: "superseded" })), { state: "stopped" },
      ]);
      expect(sibling.getState().receipts[0].items[0].state).toBe("queued");
      for (const release of releases) release({ outcome: "unknown" });
      await vi.advanceTimersByTimeAsync(0);
      expect(executor.mock.calls.map(([command]) => command.imageId)).toEqual([...held, "sibling"]);
      expect(owner.getState().receipts[0].items[0].state).toBe("unknown");
      expect(sibling.getState().receipts[0].items[0].state).toBe("rejected");
      expect(observation.readImages).not.toHaveBeenCalled();
      expect(observation.publishImages).not.toHaveBeenCalled();
    } finally { owner.getState().dispose(); sibling.getState().dispose(); queue.dispose(); for (const release of releases) release({ outcome: "unknown" }); vi.useRealTimers(); }
  });

  it.each(["same", "changed", "withdrawn"])("rechecks a waiting target after a %s grant from browsing", async grant => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    vi.useFakeTimers();
    let release!: (images: Image[]) => void;
    const executor = vi.fn().mockResolvedValue({ outcome: "acknowledged" });
    const store = createLabelEditorStore(executor, {
      readImages: () => new Promise<Image[]>(resolve => { release = resolve; }), publishImages: vi.fn(),
    }, "connected");
    const context = (imageId: string) => ({ targetIds: [imageId], targets: new Map([[imageId, {
      resource: { links: [{ rel: "edits", href: `https://metadata.example.test/metadata/${imageId}` }] },
    }]]) });
    try {
      store.getState().prepare("add", "news", context(images[0].id));
      store.getState().prepare("add", "news", context(images[1].id));
      await vi.advanceTimersByTimeAsync(100);
      const refreshed = { resource: { links: grant === "withdrawn" ? [] : [{ rel: "edits",
        href: `https://metadata.example.test/metadata/${grant === "same" ? images[1].id : "replacement"}` }] } };
      stampImageRead(images[1], refreshed, captureImageRead(), "lean");
      acceptImageOverlay(images[1].id, refreshed);
      release([{ ...images[0], userMetadata: { labels: ["news"] } }]);
      await vi.advanceTimersByTimeAsync(150);
      expect(executor).toHaveBeenCalledTimes(grant === "same" ? 2 : 1);
      expect(store.getState().receipts[1].blocked).toBe(grant === "same" ? undefined : "capabilities");
    } finally { store.getState().dispose(); release?.([]); vi.useRealTimers(); }
  });

  it.each([false, true])("rechecks the queued grant across label chunks (withdrawn=%s)", async withdrawn => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    vi.useFakeTimers();
    const queue = createBatchQueue();
    const held = queue.admit()!;
    const ids = Array.from({ length: 101 }, (_, index) => `queued-${index}`);
    const last = ids[100];
    const targets = new Map(ids.map(id => [id, { resource: { links: [{ rel: "edits", href: `/metadata/${id}` }] } }]));
    const refresh = (links: { rel: string; href: string }[]) => {
      const overlay = { resource: { links } };
      stampImageRead({ ...images[0], id: last }, overlay, captureImageRead(), "lean");
      acceptImageOverlay(last, overlay);
    };
    const execute = vi.fn(async (command: LabelCommand): Promise<GridCommandResult> => {
      if (command.imageId === ids[0]) refresh(withdrawn ? [] : targets.get(last)!.resource.links);
      return { outcome: "rejected", status: 403, errorKey: "permission-denied" };
    });
    const observation = { readImages: vi.fn(), publishImages: vi.fn() };
    const store = createLabelEditorStore(execute, observation, "connected", queue);
    try {
      expect(store.getState().prepare("add", "queued", { targetIds: ids, targets })).toBe(true);
      refresh(targets.get(last)!.resource.links);
      held.complete();
      await vi.runAllTimersAsync();
      expect(execute.mock.calls.map(([command]) => command.imageId)).toEqual(withdrawn ? ids.slice(0, 100) : ids);
      expect(store.getState().receipts[0].items.at(-1)?.state).toBe(withdrawn ? "not-started" : "rejected");
      expect(observation.readImages).not.toHaveBeenCalled();
    } finally { held.complete(); store.getState().dispose(); queue.dispose(); vi.useRealTimers(); }
  });

  it("allows a new explicit connected add after observed add and removal without replaying pending or unknown commands", async () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    vi.useFakeTimers();
    const resource = { links: [{ rel: "edits", href: "https://metadata.example.test/metadata/img-0" }] };
    const context = { targetIds: [images[0].id], targets: new Map([[images[0].id, { resource }]]) };
    let labels: string[] = [];
    let version = 0;
    const executor = vi.fn(async (command: import("@/lib/grid-commands").LabelCommand): Promise<GridCommandResult> => {
      labels = command.operation === "add-labels" ? command.labels : [];
      version++;
      return { outcome: version === 3 ? "unknown" : "acknowledged" };
    });
    const store = createLabelEditorStore(executor, {
      readImages: async () => {
        const image = { ...images[0], userMetadata: { labels, lastModified: new Date(Date.UTC(2026, 10, 7) + version * 1000).toISOString() } };
        attachEnrichment(image, { resource });
        return [image];
      },
      publishImages: vi.fn(),
    }, "connected");
    try {
      await act(async () => {
        store.getState().prepare("add", "again", context);
        store.getState().prepare("add", "again", context);
        await vi.advanceTimersByTimeAsync(250);
      });
      expect(executor).toHaveBeenCalledTimes(1);
      expect(store.getState().receipts[0].items[0].observation).toBe("observed");
      await act(async () => { store.getState().prepare("remove", "again", context); await vi.advanceTimersByTimeAsync(250); });
      expect(store.getState().receipts[1].items[0].observation).toBe("observed");
      await act(async () => { store.getState().prepare("add", "again", context); await vi.advanceTimersByTimeAsync(250); });
      expect(executor).toHaveBeenCalledTimes(3);
      expect(store.getState().receipts[2].items[0]).toMatchObject({ state: "unknown", observation: "observed" });
      await act(async () => { store.getState().prepare("add", "again", context); });
      expect(executor).toHaveBeenCalledTimes(3);
    } finally { store.getState().dispose(); vi.useRealTimers(); }
  });

  it("admits a new explicit action after an acknowledged deadline and a fresh canonical read", async () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    vi.useFakeTimers();
    const resource = { links: [{ rel: "edits", href: "https://metadata.example.test/metadata/img-0" }] };
    const context = { targetIds: [images[0].id], targets: new Map([[images[0].id, { resource }]]) };
    const executor = vi.fn().mockResolvedValue({ outcome: "acknowledged" });
    const store = createLabelEditorStore(executor, { readImages: async () => [], publishImages: vi.fn() }, "connected");
    try {
      expect(store.getState().prepare("add", "again", context)).toBe(true);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(store.getState().receipts[0].items[0]).toMatchObject({ state: "accepted-awaiting-visibility", observation: "deadline" });
      expect(store.getState().prepare("add", "again", context)).toBe(false);
      const currentResource = structuredClone(resource);
      const current = { ...images[0], userMetadata: { labels: ["again"], lastModified: "2026-11-08T00:00:00Z" } };
      attachEnrichment(current, { resource: currentResource });
      stampImageRead(current, { resource: currentResource }, captureImageRead(), "lean");
      expect(acceptEnrichedImage(current)).toBe(current);
      expect(executor).toHaveBeenCalledTimes(1);
      expect(store.getState().prepare("add", "again", {
        targetIds: [current.id], targets: new Map([[current.id, { resource: currentResource }]]),
      })).toBe(true);
      await vi.advanceTimersByTimeAsync(250);
      expect(executor).toHaveBeenCalledTimes(2);
      expect(store.getState().receipts).toHaveLength(2);
    } finally { store.getState().dispose(); vi.useRealTimers(); }
  });

  it("labels connected receipts truthfully and refuses unresolved membership", async () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const executor = vi.fn().mockResolvedValue({ outcome: "rejected", status: 403, errorKey: "permission-denied" });
    const store = createLabelEditorStore(executor, undefined, "connected");
    const resource = { links: [{ rel: "edits", href: "https://metadata.example.test/metadata/img-0" }] };
    render(<LabelEditorContext value={store}><ImageMetadata image={images[0]} overlay={{ resource }} /><EditLifecycle /></LabelEditorContext>);
    fireEvent.click(screen.getByRole("button", { name: "Add label" }));
    const input = screen.getByRole("combobox", { name: "Add label" });
    fireEvent.change(input, { target: { value: "connected label" } });
    await act(async () => fireEvent.submit(input.closest("form")!));
    expect(executor).toHaveBeenCalledTimes(1);
    expect(store.getState().receipts[0]).toMatchObject({ mode: "connected", items: [{ state: "rejected" }] });
    expect(screen.queryByRole("complementary", { name: "Label activity" })).toBeNull();
    expect(screen.queryByText(/Simulated/)).toBeNull();
    act(() => { store.getState().prepare("add", "another label", {
      targetIds: Array.from({ length: 101 }, (_, index) => `image-${index}`), targets: new Map(),
    }); });
    expect(store.getState().receipts).toHaveLength(1);
    expect(executor).toHaveBeenCalledTimes(1);
  });

  it("observes all selected label targets across the group boundary", async () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    vi.useFakeTimers();
    const ids = Array.from({ length: 101 }, (_, index) => `label-${index}`);
    const targets = new Map(ids.map(id => [id, { resource: { links: [{ rel: "edits", href: `/metadata/${id}` }] } }]));
    const execute = vi.fn(async (_command: LabelCommand): Promise<GridCommandResult> => ({ outcome: "acknowledged" }));
    const readImages = vi.fn(async (requested: string[]) => requested.map(id => ({ ...images[0], id, userMetadata: { labels: [] } })));
    const store = createLabelEditorStore(execute, { readImages, publishImages: vi.fn() }, "connected");
    try {
      expect(store.getState().prepare("remove", "news", { targetIds: ids, targets })).toBe(true);
      await vi.advanceTimersByTimeAsync(2000);
      expect(execute.mock.calls.map(([command]) => command.imageId)).toEqual(ids);
      expect(readImages.mock.calls.every(([group]) => group.length <= 100)).toBe(true);
      expect(store.getState().receipts[0].items.map(item => item.observation)).toEqual(ids.map(() => "observed"));
    } finally { store.getState().dispose(); vi.useRealTimers(); }
  });

  it("releases a stopped waiting large label edit for another queued action", () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const queue = createBatchQueue();
    const first = queue.admit()!;
    const store = createLabelEditorStore(vi.fn(), undefined, "connected", queue);
    const ids = Array.from({ length: 101 }, (_, index) => `wait-${index}`);
    const targets = new Map(ids.map(id => [id, { resource: { links: [{ rel: "edits", href: `/metadata/${id}` }] } }]));
    try {
      expect(store.getState().prepare("add", "news", { targetIds: ids, targets })).toBe(true);
      store.getState().stopRemaining(0);
      expect(store.getState().prepare("add", "next", { targetIds: ids, targets })).toBe(true);
    } finally { store.getState().dispose(); first.complete(); queue.dispose(); }
  });

  it("combines issues across fields and clears only the repaired field", () => {
    const editor = createMetadataEditorStore();
    const ids = ["issue-a", "issue-b"];
    const key = labelTargetKey(ids);
    const save = (id: number, fieldId: "metadata_credit" | "metadata_byline", failed: string) => ({ id, intent: { targetIds: ids, action: "overwrite" as const, value: "New", fieldId },
      state: "finished" as const, excluded: 0, items: ids.map(imageId => imageId === failed ? { imageId, state: "rejected" as const } : { imageId, state: "unchanged" as const, observation: "observed" as const }) });
    const byline: MetadataSave = { ...save(2, "metadata_byline", ids[1]), items: [
      { imageId: ids[0], state: "accepted-awaiting-visibility", result: { outcome: "acknowledged" }, observation: "deadline" },
      { imageId: ids[1], state: "rejected" },
    ] };
    const entries: MetadataSave[] = [save(1, "metadata_credit", ids[0]), byline];
    const publish = () => editor.setState({ panelSaves: entries.map(entry => ({ id: entry.id, targetKey: key })).reverse(), saves: new Map(entries.map(entry => [entry.id, entry])) });
    publish();
    render(<MetadataEditorContext value={editor}><SelectionSaveIndicator compact targetKey={key} /></MetadataEditorContext>);
    expect(screen.getByRole("button", { name: "2 issues" }).getAttribute("popovertarget")).toBeTruthy();
    expect(screen.getByRole("button", { name: "2 issues" }).title).toBe("Credit: 1 not saved\nByline: 1 not saved · 1 not confirmed");
    entries.push(save(3, "metadata_credit", ""));
    act(publish);
    expect(screen.getByRole("button", { name: "2 issues" }).title).toBe("Byline: 1 not saved · 1 not confirmed");
    entries.push(save(4, "metadata_byline", ids[1]));
    act(publish);
    expect(screen.getByRole("button", { name: "1 issue" }).textContent).toBe("1 issue");
  });

  it.each([1, 2])("holds the existing Details controls across a collection fence for %i images", async count => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    vi.spyOn(await import("@/lib/usage-rights-catalogue"), "readRightsEditorCatalogue").mockResolvedValue([
      { value: "", name: "Unknown Rights", description: "", properties: [] },
      { value: "publisher-photography", name: "Photography", description: "", properties: [] },
    ]);
    const editor = createMetadataEditorStore(vi.fn(), { readImages: vi.fn(), publishImages: vi.fn() });
    const selected = images.slice(0, count).map(image => ({ ...image, leases: { leases: [] } }));
    const ids = selected.map(image => image.id);
    const publish = (grant: boolean) => useEnrichmentStore.getState().setEnrichment(new Map(selected.map(image => {
      const overlay = { resource: { links: grant ? [{ rel: "edits", href: `/metadata/${image.id}` }] : [] }, actions: grant ? [{ name: "add-lease", href: "/leases/example", method: "POST" as const }] : [] };
      stampImageRead(image, overlay, captureImageRead(), "lean");
      attachEnrichment(image, overlay);
      acceptImageOverlay(image.id, overlay);
      return [image.id, overlay];
    })));
    const panel = () => <MetadataEditorContext value={editor}>{count === 1 ? <ImageMetadata image={selected[0]} /> :
      <MultiImageMetadata images={selected} total={count} reconciledView={recomputeAll(selected, RECONCILE_FIELDS)} />}</MetadataEditorContext>;
    try {
      publish(true);
      const view = render(panel());
      const lease = screen.getByRole("button", { name: "Add lease" });
      const credit = screen.getByRole("button", { name: "Edit Credit" });
      const rights = await screen.findByRole("button", { name: "Edit Rights & restrictions" });
      expect(lease.matches(":enabled") && credit.matches(":enabled")).toBe(true);
      expect(typeof admitLabelObservation(ids)).toBe("number");
      view.rerender(panel());
      expect(lease.isConnected && lease.matches(":disabled")).toBe(true);
      expect(credit.isConnected && credit.matches(":disabled")).toBe(true);
      expect(rights.isConnected && rights.matches(":disabled")).toBe(true);
      act(() => publish(false));
      expect(screen.queryByRole("button", { name: "Add lease" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Edit Credit" })).toBeNull();
    } finally { editor.getState().dispose(); }
  });

  it("keeps a buffered neighbour's lease and keyword layout when it becomes current", () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const editor = createMetadataEditorStore(vi.fn(), { readImages: vi.fn(), publishImages: vi.fn() });
    const image = { ...images[0], metadata: { keywords: ["City"] }, leases: { leases: [] } };
    const overlay = { resource: { links: [{ rel: "edits", href: "/metadata/example" }] }, actions: [{ name: "add-lease", href: "/leases/example", method: "POST" as const }] };
    const card = (inactive: boolean) => <MetadataEditorContext value={editor}><ImageMetadata image={image} overlay={overlay} editingPending={inactive} /></MetadataEditorContext>;
    const view = render(card(true));
    const add = () => screen.getByRole("button", { name: "Add lease" }) as HTMLButtonElement;
    expect(add().matches(":disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Remove City" }).matches(":disabled")).toBe(true);
    expect(screen.queryByRole("button", { name: "Apply City to all selected images" })).toBeNull();
    view.rerender(card(false));
    expect(add().matches(":disabled")).toBe(false);
    expect(screen.getByRole("button", { name: "Remove City" }).matches(":disabled")).toBe(false);
    expect(screen.queryByRole("button", { name: "Apply City to all selected images" })).toBeNull();
  });

  it("keeps affected pills visible through batch removal and publication beyond the disclosure limit", async () => {
    const { visibleEditorPills } = await import("./SearchPill");
    const values = Array.from({ length: 21 }, (_, index) => ({ value: String(index), count: 1 }));
    const changes = [{ action: "add", value: ["20", "new"], removed: ["0"] }];
    const busy = visibleEditorPills(values, false, changes).filter(item => item.pending);
    expect(busy.map(item => item.value)).toEqual(["0", "20", "new"]);
    expect(visibleEditorPills(values, false, [{ action: "overwrite", value: [] }]).every(item => item.pending)).toBe(true);
  });

  it("marks only pending pills across label queues and clears them on settlement", () => {
    const editor = createMetadataEditorStore(), labels = createLabelEditorStore();
    const targetIds = [images[0].id], targetKey = labelTargetKey(targetIds);
    const save: MetadataSave = { id: 1, intent: { fieldId: "labels", targetIds, action: "add", value: "incoming" }, state: "saving", excluded: 0, items: [] };
    editor.setState({ panelSaves: [{ id: 1, targetKey }], saves: new Map([[1, save]]) });
    labels.setState({ receipts: [{ mode: "connected", intent: { targetIds, action: "remove", label: "outgoing" },
      counts: { selected: 1, eligible: 1, ineligible: 0, unresolved: 0, unavailable: 0 }, items: [{ imageId: targetIds[0], state: "submitted" }] }] });
    const { container } = render(<MetadataEditorContext value={editor}><LabelEditorContext value={labels}>
      <LabelEditor context={{ targetIds, targets: new Map() }} values={[{ value: "outgoing", count: 1 }, { value: "untouched", count: 1 }]} onSearch={vi.fn()} />
    </LabelEditorContext></MetadataEditorContext>);
    const busy = () => Array.from(container.querySelectorAll('[data-editable-pill][aria-busy="true"]'), pill => pill.textContent);
    expect(busy().sort()).toEqual(["incoming", "outgoing"]);
    expect(screen.queryByRole("button", { name: "Apply incoming to all selected images" })).toBeNull();
    expect(screen.queryByText("Saving…")).toBeNull();
    act(() => labels.setState({ receipts: [] }));
    expect(busy()).toEqual(["incoming"]);
    act(() => editor.setState({ panelSaves: [] }));
    expect(busy()).toEqual([]);
    expect(screen.queryByText("incoming")).toBeNull();
  });

  it("repairs the same label across queues but not a different Description append", () => {
    const editor = createMetadataEditorStore(), labels = createLabelEditorStore();
    const targetIds = [images[0].id], imageId = targetIds[0], targetKey = labelTargetKey(targetIds);
    const failed = [{ imageId, state: "rejected" as const }];
    const confirmed = [{ imageId, state: "unchanged" as const, observation: "observed" as const }];
    const append = { id: 1, intent: { fieldId: "metadata_description", targetIds, action: "append", value: "A" }, state: "finished", excluded: 0, items: failed } satisfies MetadataSave;
    const other: MetadataSave = { ...append, id: 2, intent: { ...append.intent, value: "B" }, items: confirmed };
    const fix: MetadataSave = { ...append, id: 3, intent: { fieldId: "labels", action: "add", value: ["news", "sport"], targetIds }, items: confirmed };
    const receipt = { mode: "connected" as const, intent: { action: "add" as const, label: "news", targetIds }, counts: { selected: 1, eligible: 1, ineligible: 0, unresolved: 0, unavailable: 0 }, items: failed, sequence: 1 };
    labels.setState({ receipts: [receipt] });
    const saves = [append, other, { ...fix, sequence: 2 }];
    editor.setState({ saves: new Map(saves.map(save => [save.id, save])), panelSaves: saves.map(save => ({ id: save.id, targetKey })).reverse() });
    render(<MetadataEditorContext value={editor}><LabelEditorContext value={labels}><SelectedEditStatus /></LabelEditorContext></MetadataEditorContext>);
    const warning = () => screen.getByRole("button", { name: "1 issue" }).title;
    expect(warning()).toBe("Description: 1 not saved");
    act(() => editor.setState(state => ({ saves: new Map(state.saves).set(fix.id, { ...fix, items: failed, sequence: 2 }) })));
    expect(warning()).toContain("Labels: 1 not saved");
    act(() => labels.setState({ receipts: [receipt, { ...receipt, sequence: 3, items: confirmed }] }));
    expect(warning()).toContain("Labels: 1 not saved");
    act(() => labels.setState({ receipts: [receipt, { ...receipt, sequence: 4, intent: { ...receipt.intent, additionalLabels: ["sport"] }, items: confirmed }] }));
    expect(warning()).toBe("Description: 1 not saved");
  });

  it("shares uniform label failures and splits only the independently repaired histories", async () => {
    const { createLabelIssueIndex, editIssue } = await import("./EditIssueDisclosure");
    const index = createLabelIssueIndex();
    const labels = Array.from({ length: 32 }, (_, number) => `label-${number}`);
    const failed = new Map(Array.from({ length: 256 }, (_, number) => [`id-${number}`, editIssue(`id-${number}`, "Labels", undefined, true)] as const));
    index.apply(labels, failed);
    expect(index.details()).toHaveLength(256);
    index.apply(labels.slice(1), new Map([["id-0", null]]));
    index.apply(labels.slice(0, 1), new Map([["id-1", null]]));
    expect(index.details()).toHaveLength(256);
    index.apply(labels.slice(0, 1), new Map([["id-0", null]]));
    expect(index.details().some(issue => issue.imageId === "id-0")).toBe(false);
    expect(index.details().some(issue => issue.imageId === "id-1")).toBe(true);
  });

  it("uses one slot across selections and returns to the remaining save after selecting issues", () => {
    vi.useFakeTimers();
    const editor = createMetadataEditorStore();
    const labels = createLabelEditorStore();
    const imageId = images[0].id;
    const targetIds = [imageId];
    const intent = { targetIds, action: "overwrite" as const, value: { country: "UK" }, fieldId: "location" as const };
    const first = { id: 1, intent, state: "saving" as const, excluded: 0, items: [] };
    const search = useSearchStore.getState();
    useSearchStore.setState({ results: images, bufferOffset: 0, imagePositions: new Map(images.map((image, index) => [image.id, index])) });
    const key = labelTargetKey(targetIds);
    const entries = [{ id: 1, targetKey: key }];
    editor.setState({ panelSaves: entries, saves: new Map([[1, first]]) });
    labels.setState({ receipts: [{ mode: "connected", intent: { targetIds: [images[1].id], action: "add", label: "news" },
      counts: { selected: 1, eligible: 1, ineligible: 0, unresolved: 0, unavailable: 0 }, items: [{ imageId: images[1].id, state: "queued" }] }] });
    useSelectionStore.setState({ selectedIds: new Set([images[1].id]) });
    try {
      render(<MetadataEditorContext value={editor}><LabelEditorContext value={labels}><SelectedEditStatus /></LabelEditorContext></MetadataEditorContext>);
      act(() => vi.advanceTimersByTime(1500));
      expect(screen.getByRole("progressbar").textContent).toBe("2 saves: 0/2");
      const failed = { ...first, state: "finished" as const, items: [{ imageId, state: "rejected" as const }] };
      const city = { ...failed, id: 2, intent: { ...intent, value: { city: "London" } }, items: [{ imageId, state: "unchanged" as const, observation: "observed" as const }] };
      act(() => editor.setState({ panelSaves: [{ id: 2, targetKey: key }, ...entries], saves: new Map<number, MetadataSave>([[1, failed], [2, city]]) }));
      fireEvent.click(screen.getByRole("button", { name: "1 issue" }));
      expect([...useSelectionStore.getState().selectedIds]).toEqual([images[1].id]);
      expect(screen.getByRole("status", { name: "1 selected" })).toBeTruthy();
      expect(screen.getByText("Location").parentElement?.textContent).toBe("Location: 1 not saved");
      expect(fixture.reveal).not.toHaveBeenCalled();
      fireEvent.click(screen.getByText("Select only this image"));
      expect([...useSelectionStore.getState().selectedIds]).toEqual(targetIds);
      expect(useSearchStore.getState().focusedImageId).toBe(imageId);
      expect(fixture.reveal).toHaveBeenCalledOnce();
      expect(screen.getByRole("progressbar").textContent).toBe("Updating Labels: 0/1");
    } finally { useSearchStore.setState(search, true); useSelectionStore.getState().clear(); labels.getState().dispose(); editor.getState().dispose(); vi.useRealTimers(); }
  });

  it("selects the unsent remainder as well as the rejected image after label dispatch stops", () => {
    const labels = createLabelEditorStore();
    const ids = images.slice(0, 2).map(image => image.id);
    labels.setState({ receipts: [{ mode: "connected", intent: { targetIds: ids, action: "add", label: "news" },
      counts: { selected: 2, eligible: 2, ineligible: 0, unresolved: 0, unavailable: 0 }, items: [
        { imageId: ids[0], state: "rejected", result: { outcome: "rejected", status: 401, errorKey: "permission-denied" } },
        { imageId: ids[1], state: "stopped" },
      ] }] });
    render(<LabelEditorContext value={labels}><SelectedEditStatus /></LabelEditorContext>);
    fireEvent.click(screen.getByRole("button", { name: "2 issues" }));
    expect(screen.getByRole("button", { name: "2 issues" }).title).toBe("Labels: 2 not saved\nReload page");
    fireEvent.click(screen.getByText("Select only these 2"));
    expect([...useSelectionStore.getState().selectedIds]).toEqual(ids);
    act(() => useSelectionStore.getState().clear());
  });

  it("retains the focused Form after an older membership response, but honours a fresh withdrawal", async () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    vi.spyOn(await import("@/lib/usage-rights-catalogue"), "readRightsEditorCatalogue").mockResolvedValue([
      { value: "", name: "Unknown Rights", description: "", properties: [] },
      { value: "publisher-photography", name: "Photography", description: "", properties: [] },
    ]);
    const previous = useSearchStore.getState();
    const id = images[0].id;
    const editor = createMetadataEditorStore(vi.fn(), { readImages: vi.fn(), publishImages: vi.fn() });
    const schedule = vi.spyOn(editor.getState(), "schedule");
    const response = (description: string, version: number, granted: boolean) => {
      const image = { ...images[0], usageRights: { category: "" }, metadata: { description }, userMetadata: { metadata: { description }, lastModified: new Date(version).toISOString() } };
      const reasons = { no_rights: "Server rights notice", no_credit: "Server credit notice" };
      const overlay = { invalidReasons: version === 1000 ? reasons : Object.fromEntries(Object.entries(reasons).reverse()), resource: { links: granted ? [{ rel: "edits", href: `https://metadata.example.test/metadata/${id}` }] : [] } };
      stampImageRead(image, overlay, captureImageRead(), "lean");
      attachEnrichment(image, overlay);
      return { image, overlay };
    };
    const publish = ({ image, overlay }: ReturnType<typeof response>) => {
      useEnrichmentStore.getState().setEnrichment(new Map([[id, overlay]]));
      useSearchStore.setState({ results: [image], bufferOffset: 0, imagePositions: new Map([[id, 0]]) });
    };
    function ResidentForm() {
      const image = useSearchStore(state => state.results[0]);
      return image ? <MetadataEditorContext value={editor}><FormBatchContext value={{ key: "batch", ids: [id, images[1].id] }}>
        <ImageMetadata image={image} formFields={new Set(["metadata_description", "metadata_dateTaken"])} />
      </FormBatchContext></MetadataEditorContext> : null;
    }
    try {
      publish(response("Before", 1000, true));
      const held = response("Before", 1000, true);
      const mounted = render(<ResidentForm />, { wrapper: ({ children }) => <BrowsingContext value={{ path: "/upload" }}>{children}</BrowsingContext> });
      const arrowName = { name: "Clear Rights & restrictions on 1 other image", exact: true };
      const rights = await screen.findByRole("form", { name: "Image usage rights" });
      fireEvent.click(within(rights).getByRole("button", { name: "Cancel" }));
      fireEvent.click(screen.getByRole("button", { name: "Edit Rights & restrictions" }));
      fireEvent.keyDown(screen.getByLabelText("Rights category"), { key: "Escape" });
      expect(useMetadataDrafts.getState().drafts.get(id)?.has("usageRights_category")).not.toBe(true);
      expect(editor.getState().saves.size).toBe(0);
      expect(((await screen.findByRole("button", arrowName)) as HTMLButtonElement).disabled).toBe(false);
      const field = screen.getByRole("textbox", { name: "Description" }) as HTMLTextAreaElement;
      const date = screen.getByLabelText("Taken on") as HTMLInputElement;
      const warningOrder = () => screen.getAllByText(/^Server .* notice$/).map(item => item.textContent);
      const initialOrder = warningOrder();
      field.focus();
      const operation = admitLabelObservation([id]);
      if (typeof operation !== "number") throw new Error(operation);
      act(() => publish(held));
      mounted.rerender(<ResidentForm />);
      expect(field.readOnly).toBe(false);
      expect(document.activeElement).toBe(field);
      expect(date.readOnly).toBe(true);
      expect(date.closest("[inert]")).toBeNull();
      expect(date.closest("[data-grant-pending]")).not.toBeNull();
      fireEvent.change(date, { target: { value: "2026-11-21T09:30" } });
      expect(useMetadataDrafts.getState().drafts.get(id)?.has("metadata_dateTaken")).not.toBe(true);
      expect(warningOrder()).toEqual(initialOrder);
      expect((screen.queryByRole("button", arrowName) as HTMLButtonElement | null)?.disabled).toBe(true);
      act(() => publish(response("Before", 1000, true)));
      const unconfirmed = response("Before", 1000, true);
      acceptImageOverlay(id, unconfirmed.overlay);
      mounted.rerender(<ResidentForm />);
      expect(document.activeElement).toBe(field);
      expect(field.readOnly).toBe(false);
      expect((screen.queryByRole("button", arrowName) as HTMLButtonElement | null)?.disabled).toBe(true);
      fireEvent.change(field, { target: { value: "Still typing" } });
      expect(schedule).not.toHaveBeenCalled();
      mounted.unmount();
      const saved = response("After", 2000, true);
      expect(acceptObservedImages([saved.image], operation)).toEqual([saved.image]);
      act(() => publish(saved));
      act(() => publish(held));
      const remounted = render(<ResidentForm />);
      const restored = screen.getByRole("textbox", { name: "Description" }) as HTMLTextAreaElement;
      expect(restored.value).toBe("Still typing");
      expect(restored.readOnly).toBe(false);
      expect(warningOrder()).toEqual(initialOrder);
      expect(schedule).toHaveBeenCalledExactlyOnceWith(id, "metadata_description");
      restored.focus();
      acceptImageOverlay(id, response("After", 2000, false).overlay);
      remounted.rerender(<ResidentForm />);
      expect(restored.readOnly).toBe(true);
      act(() => publish(response("After", 2000, false)));
      expect(document.activeElement).toBe(restored);
      expect(restored.value).toBe("Still typing");
      expect(restored.readOnly).toBe(true);
      expect(screen.queryByRole("button", arrowName)).toBeNull();
      expect((screen.getByLabelText("Taken on") as HTMLInputElement).readOnly).toBe(true);
    } finally { cleanup(); editor.getState().dispose(); useSearchStore.setState(previous); }
  });

  it("rechecks captured standalone authority at submit without requiring a parent rerender", () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const operation = admitLabelObservation([images[0].id]);
    if (typeof operation !== "number") throw new Error(operation);
    const image = { ...images[0], userMetadata: { labels: ["news"], lastModified: "2026-11-02T00:00:00Z" } };
    const positive = { resource: { links: [{ rel: "edits", href: "https://metadata.example.test/metadata/img-0" }] } };
    stampImageRead(image, positive, captureImageRead(), "full");
    acceptObservedImages([image], operation);
    const executor = vi.fn().mockResolvedValue({ outcome: "acknowledged" });
    const store = createLabelEditorStore(executor);
    render(<LabelEditorContext value={store}><ImageMetadata image={image} overlay={positive} /></LabelEditorContext>);
    fireEvent.click(screen.getByRole("button", { name: "Add label" }));
    const input = screen.getByRole("combobox", { name: "Add label" });
    fireEvent.change(input, { target: { value: "another label" } });
    const stale = { ...image, userMetadata: { labels: [], lastModified: "2026-11-01T00:00:00Z" } };
    const denied = { resource: { links: [] }, actions: [] };
    stampImageRead(stale, denied, captureImageRead(), "lean");
    attachEnrichment(stale, denied);
    expect(acceptEnrichedImage(stale)).toBeUndefined();
    fireEvent.submit(input.closest("form")!);
    expect(executor).not.toHaveBeenCalled();
    expect(store.getState().receipts).toEqual([]);
  });

  it("keeps a single image's keyword fill while its edit grant refreshes", () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const image = { ...images[0], metadata: { keywords: ["unchanged keyword"] } };
    const overlay = { resource: { links: [{ rel: "edits", href: "https://metadata.example.test/metadata/img-0" }] } };
    const view = (pending: boolean) => <ImageMetadata image={image} overlay={overlay} labelEditing={{ targetIds: [image.id], targets: new Map([[image.id, overlay]]), pending }} />;
    const { rerender } = render(view(false));
    const remove = screen.getByRole("button", { name: "Remove unchanged keyword" });
    const pill = remove.closest("[data-editable-pill]")!;
    expect(pill.getAttribute("data-coverage")).toBe("all");
    rerender(view(true));
    expect(remove.matches(":disabled")).toBe(true);
    expect(pill.getAttribute("data-coverage")).toBe("all");
    rerender(view(false));
    expect(remove.matches(":enabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Remove unchanged keyword" })).toBe(remove);
  });

  it("does not admit editing a stale displayed body using a newer explicit context", () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const operation = admitLabelObservation([images[0].id]);
    if (typeof operation !== "number") throw new Error(operation);
    const old = { ...images[0], userMetadata: { labels: ["old"], lastModified: "2026-11-01T00:00:00Z" } };
    const current = { ...old, userMetadata: { labels: ["current"], lastModified: "2026-11-02T00:00:00Z" } };
    const positive = { resource: { links: [{ rel: "edits", href: "https://metadata.example.test/metadata/img-0" }] } };
    stampImageRead(current, positive, captureImageRead(), "lean");
    acceptObservedImages([current], operation);
    render(<ImageMetadata image={old} labelEditing={{ targetIds: [old.id], targets: new Map([[old.id, { resource: positive.resource }]]) }} />);
    expect(screen.getByRole("button", { name: "Add label" }).hasAttribute("disabled")).toBe(true);
  });

  it.each([false, true])("preflights the entire comma-separated input before dispatch (simulated=%s)", (simulated) => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const executor = vi.fn().mockResolvedValue({ outcome: "acknowledged" });
    const store = createLabelEditorStore(simulated ? executor : undefined);
    const overlay = { resource: { links: [{ rel: "edits", href: "https://metadata.example.test/metadata/img-0" }] } };
    render(<LabelEditorContext value={store}><ImageMetadata image={images[0]} overlay={overlay} /></LabelEditorContext>);
    fireEvent.click(screen.getByRole("button", { name: "Add label" }));
    const input = screen.getByRole("combobox", { name: "Add label" });
    fireEvent.change(input, { target: { value: "first label, second label" } });
    fireEvent.submit(input.closest("form")!);
    expect(executor).not.toHaveBeenCalled();
    if (simulated) {
      expect(store.getState().receipts).toHaveLength(0);
      expect(store.getState().refusal).toBe("multiple-labels");
      expect((screen.getByRole("combobox", { name: "Add label" }) as HTMLInputElement).value).toBe("first label, second label");
    } else {
      expect(store.getState().receipts.map(receipt => receipt.intent.label)).toEqual(["first label", "second label"]);
      expect(screen.queryByRole("combobox", { name: "Add label" })).toBeNull();
    }
  });

  it("cancels unsent input on Escape and retains navigation drafts, using the owned overlay without service calls", () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const transport = vi.spyOn(globalThis, "fetch");
    const store = createLabelEditorStore();
    const overlay = { resource: { links: [{ rel: "edits", href: `https://metadata.example.test/metadata/${images[0].id}` }] } };
    useEnrichmentStore.getState().setEnrichment(new Map([[images[0].id, { resource: { links: [] } }]]));
    const editor = () => <LabelEditorContext value={store}><ImageMetadata image={images[0]} overlay={overlay} /><EditLifecycle /></LabelEditorContext>;
    const first = render(editor());
    fireEvent.click(screen.getByRole("button", { name: "Add label" }));
    let input = screen.getByRole("combobox", { name: "Add label" });
    fireEvent.submit(input.closest("form")!);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(input, { target: { value: "new label" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("combobox", { name: "Add label" })).toBeNull();
    expect(store.getState().drafts.size).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Add label" }));
    input = screen.getByRole("combobox", { name: "Add label" });
    fireEvent.change(input, { target: { value: "new label" } });
    first.unmount();
    render(editor());
    fireEvent.click(screen.getByRole("button", { name: "Add label" }));
    input = screen.getByRole("combobox", { name: "Add label" });
    expect((input as HTMLInputElement).value).toBe("new label");
    expect(window.dispatchEvent(new Event("beforeunload", { cancelable: true }))).toBe(false);
    fireEvent.submit(input.closest("form")!);
    expect(window.dispatchEvent(new Event("beforeunload", { cancelable: true }))).toBe(true);
    expect(useToastStore.getState().queue.at(-1)?.message).toBe("Not sent - Add label: new label");
    expect(store.getState().receipts[0].intent.targetIds).toEqual([images[0].id]);
    expect(store.getState().receipts[0].items[0].state).toBe("not-started");
    expect(screen.queryByRole("combobox", { name: "Add label" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add label" }));
    input = screen.getByRole("combobox", { name: "Add label" });
    fireEvent.change(input, { target: { value: "second-label" } });
    fireEvent.submit(input.closest("form")!);
    expect(useToastStore.getState().queue.at(-1)?.message).toBe("Not sent - Add label: second-label");
    fireEvent.click(screen.getByRole("button", { name: "Add label" }));
    input = screen.getByRole("combobox", { name: "Add label" });
    fireEvent.change(input, { target: { value: "new label" } });
    fireEvent.submit(input.closest("form")!);
    expect(store.getState().receipts).toHaveLength(2);
    expect(screen.queryByRole("combobox", { name: "Add label" })).toBeNull();
    expect(useToastStore.getState().queue.at(-1)?.message).toBe("Not sent - Add label: new label");
    expect(transport).not.toHaveBeenCalled();
  });

  it("uses the same editor for held fake outcomes and rejects a changed target at the action boundary", async () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    let release!: (result: GridCommandResult) => void;
    const executor = vi.fn()
      .mockImplementationOnce(() => new Promise<GridCommandResult>(resolve => { release = resolve; }))
      .mockResolvedValueOnce({ outcome: "unknown" });
    const store = createLabelEditorStore(executor);
    const editing = { targetIds: images.map(image => image.id), targets: new Map(images.map(image => [image.id, {
      resource: { links: [{ rel: "edits", href: `https://metadata.example.test/metadata/${image.id}` }] },
    }])) };
    let current = editing;
    const view = recomputeAll(images, RECONCILE_FIELDS);
    view.set("labels", { kind: "chip-array", total: 2, chips: [{ value: "partial", count: 1 }] });
    render(<LabelEditorContext value={store}><MultiImageMetadata images={images} total={2} reconciledView={view}
      labelEditing={editing} resolveLabelEditing={() => current} /><EditLifecycle /></LabelEditorContext>);
    const add = screen.getByRole("button", { name: "Apply partial to all selected images" });
    current = { targetIds: ["changed"], targets: new Map([["changed", {
      resource: { links: [{ rel: "edits", href: "https://metadata.example.test/metadata/changed" }] },
    }]]) };
    fireEvent.click(add);
    expect(executor).not.toHaveBeenCalled();
    expect(store.getState().receipts).toHaveLength(0);
    current = editing;
    await act(async () => { fireEvent.click(add); fireEvent.click(add); });
    expect(executor).toHaveBeenCalledTimes(2);
    expect(store.getState().receipts[0].items.map(item => item.state)).toEqual(["submitted", "unknown"]);
    current = { ...editing, targetIds: ["changed"] };
    await act(async () => { release({ outcome: "acknowledged" }); });
    expect(store.getState().receipts[0].intent.targetIds).toEqual(editing.targetIds);
    expect(store.getState().receipts[0].items.map(item => item.state)).toEqual(["accepted-awaiting-visibility", "unknown"]);
    expect(useToastStore.getState().queue.at(-1)?.message).toBe("Not sent - Add label: partial");
  });

  it("offers separate search, apply-to-all and remove controls, blocking unresolved selected IDs", () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const view = recomputeAll(images, RECONCILE_FIELDS);
    view.set("labels", { kind: "chip-array", total: 2, chips: [{ value: "news", count: 1 }] });
    const editing = {
      targetIds: [...images.map(image => image.id), "unloaded"],
      targets: new Map(images.map(image => [image.id, { resource: { links: [{ rel: "edits", href: `https://metadata.example.test/metadata/${image.id}` }] } }])),
    };
    const { rerender } = render(<MultiImageMetadata images={images} reconciledView={view} total={2} labelEditing={editing} />);
    const row = within(fieldRow("Labels"));
    expect(row.getByRole("button", { name: "Apply news to all selected images" }).hasAttribute("disabled")).toBe(true);
    expect(row.queryByText(/selected:.*eligible/)).toBeNull();
    fireEvent.click(row.getByRole("button", { name: "news" }), { shiftKey: true });
    expect(fixture.updateSearch).toHaveBeenLastCalledWith({ query: "credit:Reuters label:news", image: undefined });
    view.set("labels", { kind: "chip-array", total: 5, chips: [{ value: "news", count: 5 }] });
    rerender(<MultiImageMetadata images={images} reconciledView={view} total={5}
      labelEditing={{ ...editing, targetIds: [images[0].id], pending: true }} />);
    expect(row.getByRole("button", { name: "Remove news" }).hasAttribute("disabled")).toBe(true);
    expect(row.getByRole("button", { name: "news" }).getAttribute("title")).not.toContain("5/1");
    expect(row.getByRole("button", { name: "Add label" }).hasAttribute("disabled")).toBe(true);
    expect(row.queryByRole("combobox", { name: "Add label" })).toBeNull();
  });
});

describe("multi-image Location punctuation", () => {
  it("keeps commas with preceding values outside search links and omits empty segments", () => {
    const view = recomputeAll(images, RECONCILE_FIELDS);
    view.set("location_subLocation", { kind: "all-same", value: "Venue", count: 2 });
    view.set("location_city", { kind: "all-same", value: "City", count: 2 });
    view.set("location_state", { kind: "all-empty", count: 2 });
    view.set("location_country", { kind: "all-same", value: "Country", count: 2 });
    render(<MultiImageMetadata images={images} reconciledView={view} total={2} />);
    const row = fieldRow("Location");
    const groups = row.querySelectorAll(".inline-flex");
    expect(row.querySelector("dd")?.textContent).toBe("Venue, City, Country");
    expect(Array.from(groups, group => group.textContent)).toEqual(["Venue,", "City,", "Country"]);
    expect(within(row).getAllByRole("button").map(button => button.textContent)).toEqual(["Venue", "City", "Country"]);
    expect(groups[0].nextSibling?.textContent).toBe(" ");
  });
});

describe("multi-image chip disclosure", () => {
  it("mounts only the first 20 frequency-ordered values, not CSS-hidden remainder", () => {
    const view = recomputeAll(images, RECONCILE_FIELDS);
    render(<MultiImageMetadata images={images} reconciledView={view} total={2} />);
    const row = within(fieldRow("Keywords"));
    const pills = row.getAllByRole("button").filter(button => button.hasAttribute("title"));
    expect(pills).toHaveLength(20);
    expect(pills.map(button => button.textContent)).toEqual(["shared", ...partialKeywords.slice(0, 19)]);
    expect(row.queryByRole("button", { name: "partial-19" })).toBeNull();
    expect(row.getByRole("button", { name: "shared" }).getAttribute("title")).toContain("2/2");
    expect(row.getByRole("button", { name: "partial-0" }).getAttribute("title")).toContain("1/2");
    expect(view.get("keywords")).toMatchObject({ kind: "chip-array", total: 2, chips: expect.arrayContaining([{ value: "partial-24", count: 1 }]) });
  });

  it("reveals the exact complete union and full-selection counts, then unmounts the remainder without requests", () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    render(<MultiImageMetadata images={images} reconciledView={recomputeAll(images, RECONCILE_FIELDS)} total={2} />);
    const row = within(fieldRow("Keywords"));
    const toggle = row.getByRole("button", { name: "Show more…" });
    const values = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    toggle.focus();
    fireEvent.click(toggle);
    expect(toggle.textContent).toBe("Show fewer");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(toggle);
    const pills = within(values).getAllByRole("button");
    expect(pills.map(button => button.textContent)).toEqual(["shared", ...partialKeywords]);
    expect(pills[0].hasAttribute("data-partial")).toBe(false);
    expect(pills[0].className).toContain("bg-[#222]");
    for (const pill of pills.slice(1)) {
      expect(pill.getAttribute("data-partial")).toBe("true");
      expect(pill.getAttribute("title")).toContain("1/2");
    }
    fireEvent.click(toggle);
    frames.splice(0).forEach(callback => callback(0));
    expect(within(values).getAllByRole("button")).toHaveLength(20);
    expect(toggle.textContent).toBe("Show more…");
    expect(document.activeElement).toBe(toggle);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps fields independent and complete lists of 20 or fewer control-free", () => {
    const view = recomputeAll(images, RECONCILE_FIELDS);
    view.set("subjects", { kind: "chip-array", total: 2, chips: Array.from({ length: 20 }, (_, i) => ({ value: `subject-${i}`, count: 2 })) });
    view.set("people", { kind: "chip-array", total: 2, chips: Array.from({ length: 21 }, (_, i) => ({ value: `person-${i}`, count: 1 })) });
    view.set("labels", { kind: "chip-array", total: 2, chips: [{ value: "shared-label", count: 2 }, { value: "partial-label", count: 1 }] });
    render(<MultiImageMetadata images={images} reconciledView={view} total={2} />);
    const subjects = within(fieldRow("Subjects"));
    const people = within(fieldRow("People"));
    const keywords = within(fieldRow("Keywords"));
    expect(subjects.getAllByRole("button")).toHaveLength(20);
    expect(subjects.queryByRole("button", { name: "Show more…" })).toBeNull();
    expect(within(fieldRow("Labels")).getByRole("button", { name: "shared-label" }).className).toContain("bg-grid-accent");
    expect(within(fieldRow("Labels")).queryByRole("button", { name: "Show more…" })).toBeNull();
    fireEvent.click(keywords.getByRole("button", { name: "Show more…" }));
    expect(keywords.getAllByRole("button").filter(button => button.hasAttribute("title"))).toHaveLength(26);
    expect(people.queryByRole("button", { name: "person-20" })).toBeNull();
    fireEvent.click(people.getByRole("button", { name: "Show more…" }));
    fireEvent.click(keywords.getByRole("button", { name: "Show fewer" }));
    expect(people.getByRole("button", { name: "person-20" })).toBeTruthy();
    expect(people.getByRole("button", { name: "Show fewer" })).toBeTruthy();
    expect(keywords.queryByRole("button", { name: "partial-24" })).toBeNull();
  });

  it("retains per-field expansion through refreshed and pending views with stable frequency ties", () => {
    const view = recomputeAll(images, RECONCILE_FIELDS);
    const { rerender } = render(<MultiImageMetadata images={images} reconciledView={view} total={2} />);
    fireEvent.click(within(fieldRow("Keywords")).getByRole("button", { name: "Show more…" }));
    const pending = new Map(view);
    pending.set("keywords", { kind: "dirty" });
    rerender(<MultiImageMetadata images={images} reconciledView={pending} total={2} />);
    expect(within(fieldRow("Keywords")).queryByRole("button")).toBeNull();
    const empty = new Map(view);
    empty.set("keywords", { kind: "chip-array", chips: [], total: 2 });
    rerender(<MultiImageMetadata images={images} reconciledView={empty} total={2} />);
    expect(screen.queryByText("Keywords", { selector: "dt" })).toBeNull();
    expect(Array.from(document.querySelectorAll("dl > .border-b")).every(section => section.childElementCount > 0)).toBe(true);
    const refreshed = new Map(view);
    const chips = [{ value: "tie-first", count: 2 }, { value: "frequent", count: 3 }, { value: "tie-second", count: 2 }, ...partialKeywords.map(value => ({ value, count: 1 }))];
    refreshed.set("keywords", { kind: "chip-array", total: 3, chips });
    rerender(<MultiImageMetadata images={images} reconciledView={refreshed} total={3} />);
    const row = within(fieldRow("Keywords"));
    expect(row.getByRole("button", { name: "Show fewer" })).toBeTruthy();
    const pills = row.getAllByRole("button").filter(button => button.hasAttribute("title"));
    expect(pills.map(button => button.textContent)).toEqual(["frequent", "tie-first", "tie-second", ...partialKeywords]);
    expect(pills[0].getAttribute("title")).toContain("3/3");
    expect(pills[1].getAttribute("title")).toContain("2/3");
    expect(chips.slice(0, 3).map(chip => chip.value)).toEqual(["tie-first", "frequent", "tie-second"]);
  });

  it("preserves plain, Shift and Alt searches on values revealed by expansion", () => {
    render(<MultiImageMetadata images={images} reconciledView={recomputeAll(images, RECONCILE_FIELDS)} total={2} />);
    const row = within(fieldRow("Keywords"));
    fireEvent.click(row.getByRole("button", { name: "Show more…" }));
    const tail = row.getByRole("button", { name: "partial-24" });
    fireEvent.click(tail);
    expect(fixture.updateSearch).toHaveBeenLastCalledWith({ query: "keyword:partial-24", image: undefined });
    fireEvent.click(tail, { shiftKey: true });
    expect(fixture.updateSearch).toHaveBeenLastCalledWith({ query: "credit:Reuters keyword:partial-24", image: undefined });
    fireEvent.click(tail, { altKey: true });
    expect(fixture.updateSearch).toHaveBeenLastCalledWith({ query: "credit:Reuters -keyword:partial-24", image: undefined });
  });

  it.each(["retained control", "removed control"] as const)("preserves newer focus before the collapse frame with a %s", (lifetime) => {
    const view = recomputeAll(images, RECONCILE_FIELDS);
    const { rerender } = render(<MultiImageMetadata images={images} reconciledView={view} total={2} />);
    fireEvent.click(within(fieldRow("Keywords")).getByRole("button", { name: "Show more…" }));
    if (lifetime === "removed control") {
      const short = new Map(view);
      short.set("keywords", { kind: "chip-array", total: 2, chips: [{ value: "shared", count: 2 }] });
      rerender(<MultiImageMetadata images={images} reconciledView={short} total={2} />);
    }
    const row = within(fieldRow("Keywords"));
    const toggle = row.getByRole("button", { name: "Show fewer" });
    toggle.focus();
    fireEvent.click(toggle);
    expect(toggle.isConnected).toBe(lifetime === "retained control");
    const newerTarget = row.getByRole("button", { name: "shared" });
    newerTarget.focus();
    frames.splice(0).forEach(callback => callback(0));
    expect(document.activeElement).toBe(newerTarget);
  });

  it("anchors collapse after commit and preserves focus when a refreshed short list removes the control", () => {
    const view = recomputeAll(images, RECONCILE_FIELDS);
    const { rerender } = render(<div style={{ overflowY: "auto" }}><MultiImageMetadata images={images} reconciledView={view} total={2} /></div>);
    fireEvent.click(within(fieldRow("Keywords")).getByRole("button", { name: "Show more…" }));
    const short = new Map(view);
    short.set("keywords", { kind: "chip-array", total: 2, chips: [{ value: "shared", count: 2 }] });
    rerender(<div style={{ overflowY: "auto" }}><MultiImageMetadata images={images} reconciledView={short} total={2} /></div>);
    const header = fieldRow("Keywords");
    const scroller = header.closest("dl")!.parentElement!;
    scroller.scrollTop = 100;
    vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue({ top: 10 } as DOMRect);
    vi.spyOn(header, "getBoundingClientRect").mockReturnValue({ top: 40 } as DOMRect);
    const toggle = within(header).getByRole("button", { name: "Show fewer" });
    toggle.focus();
    fireEvent.click(toggle);
    expect(toggle.isConnected).toBe(false);
    expect(scroller.scrollTop).toBe(100);
    frames.splice(0).forEach(callback => callback(0));
    expect(scroller.scrollTop).toBe(130);
    expect(document.activeElement).toBe(header);
    expect(within(header).getAllByRole("button")).toHaveLength(1);
  });
});
