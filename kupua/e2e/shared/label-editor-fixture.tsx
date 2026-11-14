import { createRoot, type Root } from "react-dom/client";
import { router } from "../../src/router";
import { useSelectionStore } from "../../src/stores/selection-store";
import { usePanelStore } from "../../src/stores/panel-store";
import { getWindowMaintenanceDelay, useSearchStore } from "../../src/stores/search-store";
import { buildSearchKey, retainSortValues } from "../../src/lib/image-offset-cache";
import { useUiPrefsStore } from "../../src/stores/ui-prefs-store";
import { LabelEditor, LabelEditorContext, LabelOperationReceipts } from "../../src/components/LabelEditor";
import { createLabelEditorStore } from "../../src/stores/label-editor-store";
import type { LabelEditContext } from "../../src/lib/label-operation";
import type { LabelCommand, GridCommandResult } from "../../src/lib/grid-commands";
import { MockDataSource } from "../../src/dal/mock-data-source";
import { attachedEnrichment, attachEnrichment, useEnrichmentStore } from "../../src/stores/enrichment-store";
import { createLabelReadback, publishImage, publishUnavailableImages } from "../../src/lib/image-publication";
import { resolveImageOverlay } from "../../src/lib/image-read-freshness";
import type { Image } from "../../src/types/image";
import { scrollFocusedIntoView } from "../../src/lib/orchestration/search";
import "../../src/index.css";

let root: Root;
let store = createLabelEditorStore();
let context: LabelEditContext;
let release: ((result: GridCommandResult) => void) | undefined;
let calls = 0;
let commands: LabelCommand[] = [];
let oldSearch: Promise<void> | undefined;
let continuation = false;
let dispatchHadLookahead = false;
let readbackOutcome: "acknowledged" | "unknown" = "acknowledged";
const pageBodies = new Map<string, Image>();
const media = [
  { file: "test.jpg", dimensions: { width: 700, height: 576 } },
  { file: "test-card-f.jpg", dimensions: { width: 767, height: 561 } },
  { file: "embedded-metadata.jpg", dimensions: { width: 767, height: 561 } },
];
const positiveOverlay = { resource: { links: [{ rel: "edits", href: "https://metadata.example.test/metadata/fixture" }] }, actions: [] };

function fixtureBody(image: Image): Image {
  const asset = media[Number(image.id.slice(4)) % media.length];
  const thumbnail = `/__publication-media/${asset.file}`;
  const body = pageBodies.get(image.id) ?? { ...image, metadata: { ...image.metadata, description: `Original ${image.id}` },
    userMetadata: { ...image.userMetadata, labels: ["original label"] },
    source: { ...image.source, dimensions: asset.dimensions },
    thumbnail: { secureUrl: thumbnail, mimeType: "image/jpeg", dimensions: asset.dimensions },
    __mediaLinks: { optimised: thumbnail } };
  attachEnrichment(body, positiveOverlay);
  return body;
}

function render(show = true) {
  root.render(<LabelEditorContext value={store}>
    <section aria-label="Label editor fixture" className="fixed top-16 left-4 z-[110] w-80 max-w-[calc(100vw-2rem)] bg-grid-bg text-grid-text p-3">
      {show && <dl><LabelEditor context={context} values={[{ value: "news", count: 1 }]} onSearch={() => {}} /></dl>}
    </section>
    <LabelOperationReceipts />
  </LabelEditorContext>);
}

async function readbackControl(body: Record<string, unknown>) {
  const response = await fetch("/__readback-control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error("Synthetic control failed");
}

function renderReadbackControls() {
  root.render(<LabelEditorContext value={store}>
    <style>{`body { display: flex; flex-direction: column; height: 100dvh; margin: 0; }
      #root { flex: 1; min-height: 0; } #root > .h-dvh { height: 100%; }
      #a3-fixture-controls { order: -1; height: 32px; flex: none; }`}</style>
    <section aria-label="A3 synthetic readback" className="flex h-full items-center gap-3 overflow-x-auto whitespace-nowrap bg-black px-3 text-xs text-white [&>button]:shrink-0">
      <span>{continuation ? "Unit B synthetic continuation" : "A3 synthetic readback"}</span>
      {continuation && <button onClick={() => { void labelEditorFixture.seedContinuation(); }}>Seed deep view</button>}
      <button onClick={() => { void (continuation ? readbackControl({ action: "hold" }) : labelEditorFixture.holdReadbackSearch()); }}>{continuation ? "Hold next page" : "Hold old search"}</button>
      <button onClick={() => { void (continuation ? labelEditorFixture.simulateContinuation() : labelEditorFixture.simulateReadback()); }}>{continuation ? "Simulate distant edit" : "Simulate label"}</button>
      <button onClick={() => { void labelEditorFixture.releaseReadbackSearch(); }}>Release old search</button>
      <button onClick={() => { const state = useSearchStore.getState(); const id = state.focusedImageId ?? state.results[0]?.id;
        if (id) labelEditorFixture.publishUnavailable(id, "deleted"); }}>Publish deleted</button>
      <button onClick={() => { const state = useSearchStore.getState(); const id = state.focusedImageId ?? state.results[0]?.id;
        if (id) labelEditorFixture.publishUnavailable(id, "unavailable"); }}>Publish unavailable</button>
      <span role="status" className="min-w-0 truncate">{store.getState().receipts.at(-1)?.items.map(item => `${item.state}: ${item.observation ?? "pending"}`).join(", ") ?? "Ready"}</span>
    </section>
  </LabelEditorContext>);
}

export const labelEditorFixture = {
  async prepareReadback() {
    continuation = location.pathname === "/__continuation";
    dispatchHadLookahead = false;
    const density = new URLSearchParams(location.search).get("density");
    if (density === "grid" || density === "table" || density === "justified") useUiPrefsStore.getState().setDensity(density);
    useUiPrefsStore.setState({ blurGraphicImages: false, focusMode: "explicit" });
    history.replaceState(null, "", continuation
      ? new URLSearchParams(location.search).has("tail") ? "/search?nonFree=true&query=label%3Areviewed" : "/search?nonFree=true&query=-label%3Areviewed"
      : "/search?nonFree=true");
    useSelectionStore.getState().clear();
    store = createLabelEditorStore(async command => {
      if (command.operation !== "add-labels") throw new Error("Continuation fixture supports addition only");
      if (continuation) dispatchHadLookahead = useSearchStore.getState()._extendForwardInFlight;
      await readbackControl({ action: "project", imageId: command.imageId, label: command.labels[0] });
      return { outcome: readbackOutcome };
    }, createLabelReadback(useSearchStore.getState().dataSource));
    const container = document.createElement("div");
    container.id = "a3-fixture-controls";
    document.body.append(container);
    root = createRoot(container);
    store.subscribe(renderReadbackControls);
    renderReadbackControls();
  },
  async seedContinuation(offset = 4_000_000, ordinal = offset, length = 1000, targetLocalIndex = 650) {
    const state = useSearchStore.getState();
    state.abortExtends();
    const cursor = ordinal > 0 ? [Date.UTC(2026, 10, 1) - (ordinal - 1) * 1000, `local-${ordinal - 1}`] : null;
    const page = await state.dataSource.searchAfter({ ...state.params, length }, cursor, null);
    retainSortValues(buildSearchKey(state.params), page.hits, page.sortValues, true);
    if (page.enrichment) useEnrichmentStore.getState().setEnrichment(page.enrichment);
    useSearchStore.setState({ results: page.hits, bufferOffset: offset, imagePositions: new Map(page.hits.map((image, index) => [image.id, offset + index])),
      startCursor: page.sortValues[0], endCursor: page.sortValues.at(-1)!, _terminalStart: null, _terminalEnd: null,
      _seekGeneration: state._seekGeneration + 1, _seekTargetLocalIndex: targetLocalIndex,
      _seekTargetGlobalIndex: state.total > 1000 && state.total <= 65_000 ? offset + targetLocalIndex : -1,
      loading: false, focusedImageId: null, _browseNavigation: null });
    const deadline = performance.now() + 5000;
    while (getWindowMaintenanceDelay() > 0 && performance.now() < deadline) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    }
    if (getWindowMaintenanceDelay() > 0) throw new Error("Fixture placement did not settle");
  },
  async simulateContinuation(count = 1, interruptLookahead = false, firstOrdinal = 3_350_000) {
    const ids = Array.from({ length: count }, (_, index) => `local-${firstOrdinal + index}`);
    if (ids.length === 0) return;
    const images = await useSearchStore.getState().dataSource.getByIds(ids);
    if (interruptLookahead) useSearchStore.getState().abortExtends();
    if (!store.getState().prepare("add", "reviewed", { targetIds: ids,
      targets: new Map(images.map(image => [image.id, { resource: attachedEnrichment(image)?.resource }])) })) {
      throw new Error("Synthetic continuation operation refused");
    }
  },
  async holdReadbackSearch() {
    await readbackControl({ action: "hold" });
    oldSearch = useSearchStore.getState().search();
  },
  async releaseReadbackSearch() {
    await readbackControl({ action: "release" });
    await oldSearch;
    oldSearch = undefined;
  },
  simulateReadback(targetIds?: string[], outcome: "acknowledged" | "unknown" = "acknowledged") {
    readbackOutcome = outcome;
    const state = useSearchStore.getState();
    const selected = useSelectionStore.getState();
    const ids = targetIds ?? (selected.selectedIds.size ? [...selected.selectedIds] : state.results.filter(image => image !== undefined).slice(0, 1).map(image => image.id));
    return store.getState().prepare("add", "A3 observed label", { targetIds: ids, targets: new Map(ids.map(id => {
      const image = state.results.find(image => image?.id === id) ?? selected.metadataCache.get(id);
      return [id, { resource: image ? resolveImageOverlay(image, useEnrichmentStore.getState().data.get(id), attachedEnrichment(image))?.resource : undefined }];
    })) });
  },
  readbackSnapshot() {
    return { receipts: store.getState().receipts, dispatchHadLookahead, loading: useSearchStore.getState().loading,
      selected: [...useSelectionStore.getState().selectedIds].map(id => ({ id, labels: useSelectionStore.getState().metadataCache.get(id)?.userMetadata?.labels })) };
  },
  async disposeReadback() { store.getState().dispose(); await this.releaseReadbackSearch(); },
  async preparePublication() {
    const params = new URLSearchParams(location.search);
    const density = params.get("density");
    if (density === "table" || density === "justified" || density === "grid") useUiPrefsStore.getState().setDensity(density);
    useUiPrefsStore.setState({ blurGraphicImages: false, focusMode: "explicit" });
    history.replaceState(null, "", "/search");
    pageBodies.clear();
    const corpus = new MockDataSource(1200);
    const searchAfter = corpus.searchAfter.bind(corpus);
    corpus.searchAfter = async (...args) => {
      const page = await searchAfter(...args);
      const hits = page.hits.map(fixtureBody);
      return { ...page, hits, enrichment: new Map(hits.map(image => [image.id, positiveOverlay])) };
    };
    const getByIds = corpus.getByIds.bind(corpus);
    corpus.getByIds = async (...args) => (await getByIds(...args)).map(fixtureBody);
    useSelectionStore.getState().clear();
    useSelectionStore.setState({ dataSource: corpus });
    useSearchStore.setState({ dataSource: corpus });
  },
  publish(imageId: string, label = "A2 published label") {
    const state = useSearchStore.getState();
    const original = state.results.find(image => image?.id === imageId);
    if (!original) throw new Error("Publication target is not resident");
    const current = original;
    const updated = { ...current, metadata: { ...current.metadata, description: "A2 published description" },
      userMetadata: { ...current.userMetadata, labels: [label] } };
    publishImage(updated, { resource: { links: [] }, actions: [] });
  },
  publishUnavailable(imageId: string, availability: "deleted" | "unavailable" = "deleted") {
    publishUnavailableImages([imageId], availability);
  },
  async acceptNewerPage(imageId: string) {
    const image = useSearchStore.getState().results.find(candidate => candidate?.id === imageId);
    if (!image) throw new Error("Page target is not resident");
    pageBodies.set(imageId, { ...image, metadata: { ...image.metadata, description: "A2 newer page description" },
      userMetadata: { ...image.userMetadata, labels: ["A2 newer page label"] } });
    await useSearchStore.getState().search();
    const accepted = useSearchStore.getState().results.find(candidate => candidate?.id === imageId);
    if (accepted) useSelectionStore.getState().publishSelectedMetadata([accepted]);
  },
  publishGeometryChange(imageId: string) {
    const image = useSearchStore.getState().results.find(candidate => candidate?.id === imageId);
    if (!image) throw new Error("Geometry target is not resident");
    const dimensions = image.source.orientedDimensions ?? image.source.dimensions!;
    publishImage({ ...image, source: { ...image.source,
      orientedDimensions: { ...dimensions, width: dimensions.width * 2 } } },
    useEnrichmentStore.getState().data.get(imageId) ?? {});
  },
  publicationSnapshot(imageId: string) {
    const state = useSearchStore.getState();
    const source = state.results.find(image => image?.id === imageId);
    const selected = useSelectionStore.getState();
    return { resident: source?.metadata.description,
      residentLabels: source?.userMetadata?.labels,
      selected: selected.metadataCache.get(imageId)?.metadata.description,
      links: useEnrichmentStore.getState().data.get(imageId)?.resource?.links.length,
      selectedIds: [...selected.selectedIds], anchorId: selected.anchorId,
      reconciling: selected.isReconciling };
  },
  async revealPublicationTarget(imageId: string) {
    useSearchStore.getState().setFocusedImageId(imageId);
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    scrollFocusedIntoView();
  },
  focus(imageId: string) {
    const image = useSelectionStore.getState().metadataCache.get(imageId);
    if (!image) throw new Error("Fixture image was not loaded");
    useSelectionStore.getState().clear();
    useUiPrefsStore.getState().setFocusMode("explicit");
    useSearchStore.setState({ focusedImageId: imageId, results: [image], imagePositions: new Map([[imageId, 0]]), bufferOffset: 0, total: 1 });
  },
  navigate(image?: string) { return router.navigate({ to: "/search", search: image ? { image } : {} }); },
  select(targetIds: string[]) {
    useSelectionStore.getState().clear();
    useSelectionStore.getState().add(targetIds);
    if (!usePanelStore.getState().config.right.visible) usePanelStore.getState().togglePanel("right");
  },
  mount(simulated = false, observed = false, held = false) {
    if (!root) {
      const container = document.createElement("div");
      document.body.append(container);
      root = createRoot(container);
    }
    calls = 0;
    commands = [];
    release = undefined;
    store.getState().dispose();
    store = createLabelEditorStore(simulated ? async command => {
      calls++;
      commands.push(command);
      if (observed && !held) return { outcome: calls === 1 ? "acknowledged" : "unknown" };
      if (calls === 1) return new Promise<GridCommandResult>(resolve => { release = resolve; });
      return { outcome: "unknown" };
    } : undefined, observed ? createLabelReadback(useSearchStore.getState().dataSource) : undefined);
    this.targets(["fixture", "other"]);
  },
  targets(targetIds: string[], pending = false) {
    context = { targetIds, pending, targets: new Map(targetIds.map(imageId => [imageId, {
      resource: { links: [{ rel: "edits", href: `https://metadata.example.test/metadata/${imageId}` }] },
    }])) };
    render();
  },
  show: render,
  release(result: GridCommandResult) { release?.(result); release = undefined; },
  snapshot() { return { calls, commands, receipts: store.getState().receipts }; },
};