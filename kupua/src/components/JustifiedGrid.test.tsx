// @vitest-environment jsdom

import { StrictMode, Suspense, useLayoutEffect, useRef } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Image } from "@/types/image";
import type { ImageGridProps } from "./ImageGrid";
import type { WindowedJustifiedLayout } from "@/lib/windowed-justified-layout";

const fixture = vi.hoisted(() => ({ start: 400, searchKey: "original", suspend: false,
  committed: undefined as WindowedJustifiedLayout | undefined, attempts: 0 }));
vi.mock("./ImageGrid", () => ({ ImageGrid: (props: ImageGridProps) => {
  const previous = useRef<WindowedJustifiedLayout | undefined>(undefined);
  const images = Array.from({ length: 100 }, (_, index) => ({ id: `fixture-${fixture.start + index}`,
    source: { dimensions: { width: [150, 100, 75][index % 3], height: 100 } } }) as Image);
  const layout = props.layoutFactory!(images, 390,
    { bufferOffset: fixture.start, total: 100000, indexed: false, searchKey: fixture.searchKey }, previous.current) as WindowedJustifiedLayout;
  useLayoutEffect(() => {
    previous.current = layout;
    props.onLayoutCommit?.(layout);
    fixture.committed = layout;
  }, [layout, props.onLayoutCommit]);
  fixture.attempts++;
  if (fixture.suspend) throw new Promise(() => {});
  return null;
} }));

import { JustifiedGrid } from "./JustifiedGrid";

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(390);
  fixture.start = 400;
  fixture.searchKey = expect.getState().currentTestName!;
  fixture.suspend = false;
  fixture.committed = undefined;
  fixture.attempts = 0;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const tree = () => <StrictMode><Suspense fallback={null}><JustifiedGrid /></Suspense></StrictMode>;

describe("committed cross-density dimension context", () => {
  it("does not publish abandoned query geometry over committed overlap context", () => {
    const view = render(tree());
    fixture.start = 440;
    view.rerender(tree());
    expect(fixture.committed!.origin).toBe(40);
    const committed = fixture.committed!;
    const key = fixture.searchKey;
    const attempts = fixture.attempts;
    fixture.searchKey = "uncommitted-query";
    fixture.start = 2000;
    fixture.suspend = true;
    act(() => view.rerender(tree()));
    expect(fixture.attempts).toBeGreaterThan(attempts);
    view.unmount();
    fixture.searchKey = key;
    fixture.start = 440;
    fixture.suspend = false;
    render(tree());
    expect(fixture.committed!.origin).toBe(40);
    expect(fixture.committed!.getBox(30)).toEqual(committed.getBox(30));
  });

  it.each(["query", "no-overlap"])("invalidates committed context after %s replacement", replacement => {
    const view = render(tree());
    fixture.start = 440;
    view.rerender(tree());
    expect(fixture.committed!.origin).toBe(40);
    view.unmount();
    if (replacement === "query") fixture.searchKey += "-new";
    else fixture.start = 2000;
    render(tree());
    expect(fixture.committed!.origin).toBe(0);
    expect(fixture.committed!.dimensions.size).toBe(100);
  });
});
