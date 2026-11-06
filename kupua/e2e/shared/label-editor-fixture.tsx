import { createRoot, type Root } from "react-dom/client";
import { router } from "../../src/router";
import { useSelectionStore } from "../../src/stores/selection-store";
import { usePanelStore } from "../../src/stores/panel-store";
import { useSearchStore } from "../../src/stores/search-store";
import { useUiPrefsStore } from "../../src/stores/ui-prefs-store";
import { LabelEditor, LabelEditorContext, LabelOperationReceipts } from "../../src/components/LabelEditor";
import { createLabelEditorStore } from "../../src/stores/label-editor-store";
import type { LabelEditContext } from "../../src/lib/label-operation";
import type { GridCommandResult } from "../../src/lib/grid-commands";
import { MockDataSource } from "../../src/dal/mock-data-source";
import { attachEnrichment, useEnrichmentStore } from "../../src/stores/enrichment-store";
import { publishImage } from "../../src/lib/image-publication";
import type { Image } from "../../src/types/image";
import { scrollFocusedIntoView } from "../../src/lib/orchestration/search";
import "../../src/index.css";

let root: Root;
let store = createLabelEditorStore();
let context: LabelEditContext;
let release: ((result: GridCommandResult) => void) | undefined;
let calls = 0;
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

export const labelEditorFixture = {
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
  publish(imageId: string) {
    const state = useSearchStore.getState();
    const original = state.results.find(image => image?.id === imageId);
    if (!original) throw new Error("Publication target is not resident");
    const current = original;
    const updated = { ...current, metadata: { ...current.metadata, description: "A2 published description" },
      userMetadata: { ...current.userMetadata, labels: ["A2 published label"] } };
    publishImage(updated, { resource: { links: [] }, actions: [] });
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
  mount(simulated = false) {
    if (!root) {
      const container = document.createElement("div");
      document.body.append(container);
      root = createRoot(container);
    }
    calls = 0;
    release = undefined;
    store = createLabelEditorStore(simulated ? async () => {
      calls++;
      if (calls === 1) return new Promise<GridCommandResult>(resolve => { release = resolve; });
      return { outcome: "unknown" };
    } : undefined);
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
  snapshot() { return { calls, receipts: store.getState().receipts }; },
};