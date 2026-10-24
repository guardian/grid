import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { prepareReverseGridScroll, installReverseGridDirectionProbe, readFocusedViewportPosition } from "../fixed-grid-probes.mjs";

const ROW = 303;
const MIN_WIDTH = 250;

function fixture({ bufferOffset = 618204, scrollTop = 2551, columns = 6, view = "grid" } = {}) {
  const listeners = new Map();
  const state = { bufferOffset, _prependGeneration: 0, focusedImageId: "focus",
    imagePositions: new Map([["focus", bufferOffset + 2]]), results: Array(500) };
  const container = { clientWidth: columns * MIN_WIDTH, clientHeight: 900, scrollHeight: 30000, scrollTop,
    querySelector: () => ({ children: Array(columns - bufferOffset % columns) }),
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name, callback) => {
      assert.equal(listeners.get(name), callback);
      listeners.delete(name);
    } };
  const window = { __kupua_store__: { getState: () => state } };
  const document = { querySelector: (selector) => selector.includes(view) ? container : null };
  // Exercise the same closure-free serialization used by page/locator.evaluate.
  const evaluate = (fn, ...args) => runInNewContext(`(${fn.toString()})(...args)`, { window, document, args });
  return { state, container, window, listeners, evaluate };
}

function install(f, columns = 6) {
  f.evaluate(installReverseGridDirectionProbe, { columns, rowHeight: ROW });
  return f.window.__p17DirectionProbe__;
}

function positions(probe) {
  return Array.from(probe.samples, (sample) => sample.globalPosition);
}

test("P17 recorded 200-image prepend preserves position rather than inventing a four-image reversal", () => {
  const f = fixture();
  const probe = install(f);
  f.state.bufferOffset = 618004;
  f.state._prependGeneration++;
  f.container.scrollTop = 12853;
  f.listeners.get("scroll")();
  assert.deepEqual(positions(probe), [618252, 618252]);
  assert.equal(probe.samples[1].prependGeneration, 1);
  probe.sample();
  assert.equal(probe.samples.length, 2);
  probe.cleanup();
  assert.equal(f.listeners.size, 0);
});

test("P17 aligned historical prepend remains unchanged and true forward movement still fails", () => {
  const f = fixture();
  const probe = install(f);
  f.state.bufferOffset -= 198;
  f.state._prependGeneration++;
  f.container.scrollTop += 33 * ROW;
  probe.sample();
  assert.deepEqual(positions(probe), [618252, 618252]);
  f.container.scrollTop += ROW;
  probe.sample();
  assert.equal(probe.samples[2].globalPosition - probe.samples[1].globalPosition, 6);
});

test("P17 full-page prepends preserve direction for every row phase and narrow/wide grids", () => {
  for (const columns of [1, 3, 4, 5, 6, 7]) {
    for (let phase = 0; phase < columns; phase++) {
      const offset = 1000 * columns + phase;
      const f = fixture({ bufferOffset: offset, columns });
      const probe = install(f, columns);
      f.state.bufferOffset -= 200;
      f.state._prependGeneration++;
      f.container.scrollTop += (Math.floor(offset / columns) - Math.floor(f.state.bufferOffset / columns)) * ROW;
      probe.sample();
      assert.equal(probe.samples[1].globalPosition, probe.samples[0].globalPosition, `columns=${columns}, phase=${phase}`);
      f.container.scrollTop -= ROW;
      probe.sample();
      assert.equal(probe.samples[2].globalPosition, probe.samples[1].globalPosition - columns);
    }
  }
});

test("P17 setup uses grid width, not the number of cells in a partial first row", () => {
  for (let phase = 0; phase < 6; phase++) {
    const f = fixture({ bufferOffset: 6000 + phase });
    const setup = f.evaluate(prepareReverseGridScroll, f.container, {
      threshold: 50, rowHeight: ROW, minCellWidth: MIN_WIDTH, bufferOffset: f.state.bufferOffset,
    });
    assert.equal(setup.columns, 6);
    const firstLocalItem = Math.floor(f.container.scrollTop / ROW) * 6 - phase;
    assert.ok(firstLocalItem >= 50 + 6 * 8, `phase=${phase}, local=${firstLocalItem}`);
    assert.ok(firstLocalItem < 50 + 6 * 9);
  }
});

test("focused grid measurements account for partial first rows before and after prepend", () => {
  const f = fixture({ bufferOffset: 618204, scrollTop: 2 * ROW });
  f.state.imagePositions.set("focus", 618216);
  const read = () => f.evaluate(readFocusedViewportPosition, { GRID_ROW: ROW, GRID_COLS: MIN_WIDTH, TABLE_ROW: 40 });
  assert.equal(read().viewportY, 0);
  f.state.bufferOffset -= 200;
  f.container.scrollTop += 34 * ROW;
  assert.equal(read().viewportY, 0);
  assert.equal(read().viewportRatio, 0);
});

test("focused measurements preserve aligned grid/table behavior and unavailable-focus handling", () => {
  for (const view of ["grid", "table"]) {
    const f = fixture({ bufferOffset: 6000, scrollTop: 0, view });
    const read = () => f.evaluate(readFocusedViewportPosition, { GRID_ROW: ROW, GRID_COLS: MIN_WIDTH, TABLE_ROW: 40 });
    assert.equal(read().viewportY, view === "grid" ? 0 : 80);
    assert.equal(read().view, view);
    f.state.focusedImageId = null;
    assert.equal(read(), null);
    f.state.focusedImageId = "absent";
    assert.equal(read(), null);
    f.state.focusedImageId = "focus";
    f.state.imagePositions.set("focus", 5999);
    assert.equal(read(), null);
    f.state.imagePositions.set("focus", 6500);
    assert.equal(read(), null);
  }
});
