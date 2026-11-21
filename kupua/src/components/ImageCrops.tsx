import { memo, useDeferredValue, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import type { Image } from "@/types/image";
import { getThumbnailUrl } from "@/lib/image-urls";
import { allowsCropRatio, BUILT_IN_CROP_OPTIONS, FREEFORM, type CropSettings } from "@/lib/crop/crop-options";
import { GRID_CLASSIC } from "@/lib/results-zoom";

type ImageExport = NonNullable<Image["exports"]>[number];

export function latestCrops(crops: Image["exports"] = []): ImageExport[] {
  const latest = new Map<string, { crop: ImageExport; time: number }>();
  for (const [index, crop] of crops.entries()) {
    const bounds = crop.specification?.bounds as { x: number; y: number; width: number; height: number } | undefined;
    const identity = crop.id || (bounds ? `${bounds.x}_${bounds.y}_${bounds.width}_${bounds.height}` : undefined);
    const key = identity ? `crop:${identity}` : `unknown:${index}`;
    const parsedTime = Date.parse(crop.date ?? "");
    const time = Number.isNaN(parsedTime) ? -Infinity : parsedTime;
    const previous = latest.get(key);
    if (!previous || time > previous.time) latest.set(key, { crop, time });
  }
  return Array.from(latest.values(), value => value.crop);
}

function fileSize(bytes?: number) {
  if (!bytes) return "0 Byte";
  const units = ["Bytes", "KB", "MB", "GB"];
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1000)), units.length - 1);
  return `${Number((bytes / 1000 ** unit).toFixed(2))} ${units[unit]}`;
}

export function cropAsset(crop: ImageExport, size: "thumbnail" | "preview") {
  let selected: Image["source"] | undefined;
  for (const asset of crop.assets ?? []) {
    if (!asset.secureUrl && !asset.file) continue;
    const width = asset.dimensions?.width ?? 0;
    const selectedWidth = selected?.dimensions?.width ?? 0;
    if (!selected || (size === "thumbnail" ? width < selectedWidth : width > selectedWidth)) selected = asset;
  }
  return selected ?? (crop.master?.secureUrl || crop.master?.file ? crop.master : undefined);
}

export const ImageCrops = memo(function ImageCrops({ image, selectedId, onSelect, settings, canReadExports, compact = false }: {
  image: Image; selectedId?: string; onSelect: (id: string | undefined) => void; compact?: boolean;
  settings: CropSettings;
  canReadExports: boolean;
}) {
  const deferredImage = useDeferredValue<Image | null>(image, null);
  const exportImage = canReadExports && deferredImage?.id === image.id ? deferredImage : null;
  const dimensions = image.source?.orientedDimensions ?? image.source?.dimensions;
  const thumbnail = getThumbnailUrl(image);
  const { displayedCrops, fullFrames, crops } = useMemo(() => {
    const displayedCrops = latestCrops(exportImage?.exports);
    return { displayedCrops,
      fullFrames: displayedCrops.filter(crop => (crop.specification?.type ?? crop.type) === "full"),
      crops: displayedCrops.filter(crop => (crop.specification?.type ?? crop.type) !== "full") };
  }, [exportImage?.exports]);
  const cropGrid = compact ? displayedCrops.length > 1
    ? "grid grid-cols-2 gap-2" : "grid grid-cols-1 gap-2 w-[calc((100%_-_0.5rem)/2)]" : "space-y-2";
  const tileClass = "group block w-full min-w-0 text-left border-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50";
  const renderThumbnail = (src: string | undefined, alt: string, dimensions?: Image["source"]["dimensions"]) => <span
    className={compact ? "relative block w-full overflow-hidden bg-[#222]" : "block"}
    style={compact ? { aspectRatio: `${GRID_CLASSIC.minCellWidth} / ${GRID_CLASSIC.thumbHeight}` } : undefined}>
    {src ? <img src={src} alt={alt} width={dimensions?.width} height={dimensions?.height}
      className={compact ? "absolute inset-0 size-full object-contain" : "block mx-auto max-w-full max-h-16 w-auto h-auto object-contain"}
      loading="lazy" fetchPriority="low" decoding="async" />
      : <span className={`${compact ? "absolute inset-0" : "min-h-16"} flex items-center justify-center text-2xs text-grid-text-dim`}>Preview unavailable</span>}
  </span>;
  const renderCrop = (crop: ImageExport, index: number) => {
    const thumbnail = cropAsset(crop, "thumbnail");
    const dimensions = crop.specification?.bounds as Image["source"]["dimensions"] | undefined
      ?? crop.master?.dimensions ?? cropAsset(crop, "preview")?.dimensions;
    const ratio = typeof crop.specification?.aspectRatio === "string" ? crop.specification.aspectRatio : undefined;
    const cropType = BUILT_IN_CROP_OPTIONS.find(option => option.ratioString === ratio)?.key ?? FREEFORM.key;
    const fullFrame = (crop.specification?.type ?? crop.type) === "full";
    const selected = Boolean(crop.id && crop.id === selectedId);
    const compatible = allowsCropRatio(settings, crop.specification?.aspectRatio);
    const initials = crop.author?.split("@")[0].split(".").map(part => part.charAt(0).toUpperCase()).join("");
    return <button type="button" key={`${image.id}:${crop.id ?? "crop"}:${index}`} disabled={!crop.id || !thumbnail || !compatible}
      title={!compatible ? `${settings.options[0]?.ratioString ?? settings.lockedType} crops only` : undefined}
      aria-label={fullFrame ? "View full frame" : dimensions ? `View ${dimensions.width} by ${dimensions.height} crop` : "View crop"}
      aria-pressed={selected} onClick={() => onSelect(crop.id)}
      className={`${tileClass} ${selected ? "border-grid-accent" : "border-transparent hover:border-grid-text-dim"}`}>
      {renderThumbnail(thumbnail?.secureUrl ?? thumbnail?.file, fullFrame ? "Full frame thumbnail" : "Crop thumbnail", thumbnail?.dimensions)}
      <span className={`block bg-[#333] px-0.5 py-0.5 text-2xs ${selected ? "text-white" : "text-grid-text-dim"}`}>
        {!fullFrame && <span className="flex flex-wrap items-baseline justify-between gap-x-1"><span>{cropType}</span>{ratio && <span>({ratio})</span>}</span>}
        <span className="flex min-h-[22px] flex-wrap items-center justify-between gap-x-1">
          <span>{dimensions ? `${dimensions.width} \u00d7 ${dimensions.height}` : "Unknown dimensions"}</span>
          {initials && <span className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-full bg-[#6e6e6e] text-[11px] font-semibold text-white"
            title={`Cropped by ${crop.author}${crop.date ? ` at ${new Date(crop.date).toLocaleString()}` : ""}`}>{initials}</span>}
        </span>
      </span>
    </button>;
  };
  return <>
    <section aria-label="Original image" className="p-2 border-b border-grid-separator">
      <div style={compact ? { width: "calc((100% - 0.5rem) / 2)" } : undefined}>
      <h3 className="mb-1 flex items-baseline justify-between gap-x-1 whitespace-nowrap text-xs font-bold text-grid-text-dim">
        Original <span className="text-2xs font-normal">{fileSize(image.source?.size)}</span>
      </h3>
      <button type="button" aria-label="View original image" aria-pressed={!selectedId} onClick={() => onSelect(undefined)}
        className={`${tileClass} ${!selectedId ? "border-grid-accent" : "border-transparent hover:border-grid-text-dim"}`}>
        {renderThumbnail(thumbnail, "Original image thumbnail", image.thumbnail?.dimensions ?? dimensions)}
        <span className={`block bg-[#333] px-0.5 py-0.5 text-2xs ${!selectedId ? "text-white" : "text-grid-text-dim"}`}>
          {dimensions ? `${dimensions.width} \u00d7 ${dimensions.height}` : "Unknown dimensions"}
        </span>
      </button>
      </div>
    </section>
    {canReadExports && !exportImage && Boolean(image.exports?.length) && <p role="status" className="p-2 text-2xs text-grid-text-dim">Loading crops...</p>}
    {fullFrames.length > 0 && <section aria-label="Full frame" className="p-2 border-b border-grid-separator">
      <h3 className="mb-1 text-xs font-bold text-grid-text-dim">Full frame</h3>
      <div className={cropGrid}>{fullFrames.map(renderCrop)}</div>
    </section>}
    {crops.length > 0 && <section aria-label="Image crops" className="p-2 border-b border-grid-separator">
      <h3 className="mb-1 text-xs font-bold text-grid-text-dim">Crops</h3>
      <div className={cropGrid}>{crops.map(renderCrop)}</div>
    </section>}
  </>;
});

export function MobileImageCrops({ active, ...props }: ComponentProps<typeof ImageCrops> & { active: boolean }) {
  const region = useRef<HTMLDivElement>(null);
  const [reached, setReached] = useState(false);
  const height = useRef(1);
  useEffect(() => {
    if (!active || reached || !region.current) return;
    if (typeof IntersectionObserver === "undefined") { setReached(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setReached(true);
        observer.disconnect();
      }
    });
    observer.observe(region.current);
    return () => observer.disconnect();
  }, [active, reached]);
  useEffect(() => {
    if (!active || !reached || !region.current) return;
    const element = region.current;
    const observer = new ResizeObserver(() => { height.current = Math.max(1, element.getBoundingClientRect().height); });
    observer.observe(element);
    return () => observer.disconnect();
  }, [active, reached]);
  return <div ref={region} style={{ minHeight: height.current }}>
    {active && reached && <ImageCrops {...props} />}
  </div>;
}