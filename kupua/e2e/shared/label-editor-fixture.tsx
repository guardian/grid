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
import "../../src/index.css";

let root: Root;
let store = createLabelEditorStore();
let context: LabelEditContext;
let release: ((result: GridCommandResult) => void) | undefined;
let calls = 0;

function render(show = true) {
  root.render(<LabelEditorContext value={store}>
    <section aria-label="Label editor fixture" className="fixed top-16 left-4 z-[110] w-80 max-w-[calc(100vw-2rem)] bg-grid-bg text-grid-text p-3">
      {show && <dl><LabelEditor context={context} values={[{ value: "news", count: 1 }]} onSearch={() => {}} /></dl>}
    </section>
    <LabelOperationReceipts />
  </LabelEditorContext>);
}

export const labelEditorFixture = {
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