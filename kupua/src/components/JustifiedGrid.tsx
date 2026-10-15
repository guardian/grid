import { useLayoutEffect, useRef, useState } from "react";
import { ImageGrid, type ImageGridProps } from "./ImageGrid";
import { buildJustifiedLayout } from "@/lib/justified-layout";
import { buildWindowedJustifiedLayout, type WindowedJustifiedLayout, type JustifiedWindowSnapshot } from "@/lib/windowed-justified-layout";
import { WINDOWED_JUSTIFIED_ENABLED } from "@/lib/resident-preview";
import type { Image } from "@/types/image";

// Keep only bounded identity/dimension context across density unmounts, never image records.
let windowSnapshot: JustifiedWindowSnapshot | undefined;
const layoutFactory: NonNullable<ImageGridProps["layoutFactory"]> = (images, width, context, previous) => {
  if (!WINDOWED_JUSTIFIED_ENABLED) return buildJustifiedLayout(images as Image[], width);
  return buildWindowedJustifiedLayout(images, width, context,
    previous as WindowedJustifiedLayout | undefined ?? windowSnapshot);
};
const commitLayout: NonNullable<ImageGridProps["onLayoutCommit"]> = layout => {
  if (!WINDOWED_JUSTIFIED_ENABLED) return;
  const snapshot = layout as WindowedJustifiedLayout;
  windowSnapshot = { origin: snapshot.origin, searchKey: snapshot.searchKey,
    indexed: snapshot.indexed, dimensions: snapshot.dimensions };
};

/** Mount with real container geometry so an admitted restore never consumes a guessed width. */
export function JustifiedGrid(props: Pick<ImageGridProps, "handleRange">) {
  const container = useRef<HTMLDivElement>(null);
  const [initialWidth, setInitialWidth] = useState(0);
  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    const measure = () => {
      if (element.clientWidth > 0) {
        setInitialWidth(element.clientWidth);
        return true;
      }
      return false;
    };
    if (measure()) return;
    const observer = new ResizeObserver(() => { if (measure()) observer.disconnect(); });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <div ref={container} className="flex flex-1 min-h-0 min-w-0">
    {initialWidth > 0 && <ImageGrid {...props} layoutFactory={layoutFactory} onLayoutCommit={commitLayout} initialWidth={initialWidth} />}
  </div>;
}
