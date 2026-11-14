// Keep browser callbacks self-contained: Playwright serializes them without imports.
export function prepareReverseGridScroll(element, { threshold, rowHeight, minCellWidth, bufferOffset }) {
  if (element.clientWidth <= 0) throw new Error("P17 grid width is unavailable");
  const columns = Math.max(1, Math.floor(element.clientWidth / minCellWidth));
  const targetFlatStart = threshold + columns * 8;
  element.scrollTop = Math.ceil((targetFlatStart + bufferOffset % columns) / columns) * rowHeight;
  return { columns };
}

export function installReverseGridDirectionProbe({ columns, rowHeight }) {
  const store = window.__kupua_store__;
  const container = document.querySelector('[aria-label="Image results grid"]');
  if (!store || !container) throw new Error("P17 direction-probe prerequisites are unavailable");
  const samples = [];
  const sample = () => {
    const state = store.getState();
    const localPosition = Math.floor(container.scrollTop / rowHeight) * columns;
    // A partial first row starts at the preceding global row boundary, not bufferOffset.
    const globalPosition = Math.floor(state.bufferOffset / columns) * columns + localPosition;
    const prependGeneration = state._prependGeneration;
    const previous = samples.at(-1);
    if (previous?.globalPosition !== globalPosition || previous?.prependGeneration !== prependGeneration) {
      samples.push({ globalPosition, prependGeneration });
    }
  };
  container.addEventListener("scroll", sample, { passive: true });
  sample();
  window.__p17DirectionProbe__ = {
    samples,
    sample,
    cleanup: () => container.removeEventListener("scroll", sample),
  };
}

export function readFocusedViewportPosition({ GRID_ROW, GRID_COLS, TABLE_ROW }) {
  const store = window.__kupua_store__;
  if (!store) return null;
  const s = store.getState();
  const fid = s.focusedImageId;
  if (!fid) return null;
  const gIdx = s.imagePositions.get(fid);
  if (gIdx == null) return null;
  const localIdx = gIdx - s.bufferOffset;
  if (localIdx < 0 || localIdx >= s.results.length) return null;

  const grid = document.querySelector('[aria-label="Image results grid"]');
  const table = document.querySelector('[aria-label="Image results table"]');
  const el = grid ?? table;
  if (!el) return null;

  const isGrid = !!grid;
  let rowTop;
  if (isGrid) {
    const cols = Math.max(1, Math.floor(el.clientWidth / GRID_COLS));
    rowTop = (Math.floor(gIdx / cols) - Math.floor(s.bufferOffset / cols)) * GRID_ROW;
  } else {
    rowTop = localIdx * TABLE_ROW;
  }

  const viewportY = rowTop - el.scrollTop;
  return {
    viewportY: Math.round(viewportY),
    viewportRatio: Math.round((viewportY / el.clientHeight) * 1000) / 1000,
    visible: viewportY >= -GRID_ROW && viewportY <= el.clientHeight + GRID_ROW,
    view: isGrid ? "grid" : "table",
    scrollTop: Math.round(el.scrollTop),
    scrollHeight: Math.round(el.scrollHeight),
    clientHeight: Math.round(el.clientHeight),
    localIdx,
    bufferOffset: s.bufferOffset,
    resultsLength: s.results.length,
  };
}
