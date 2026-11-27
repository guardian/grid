import { morphPhotoFit, morphRect, type MorphTrack } from "./justified-zoom-morph";

export interface MorphRenderer {
  draw(progress: number): void;
  ready(): boolean;
  dispose(): void;
}

function usable(image: HTMLImageElement): boolean {
  return image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
}

export function createMorphRenderer(host: HTMLElement, tracks: readonly MorphTrack[], background: string): MorphRenderer | undefined {
  if (tracks.some(track => [track.outgoing, track.incoming].some(image => image && !usable(image)))) return;
  const root = document.createElement("div");
  root.dataset.zoomMorphRenderer = "dom";
  Object.assign(root.style, { position: "absolute", inset: "0", overflow: "hidden", background, visibility: "hidden" });
  let renderer: MorphRenderer | undefined;
  try {
    renderer = domRenderer(root, tracks, background);
    host.appendChild(root);
    const owned = renderer;
    return { draw: p => owned.draw(Math.max(0, Math.min(1, p))), ready: () => { const ready = owned.ready(); if (ready) root.style.visibility = "visible"; return ready; }, dispose: () => { owned.dispose(); root.remove(); } };
  } catch {
    renderer?.dispose();
    root.remove();
    return;
  }
}

function domRenderer(root: HTMLElement, tracks: readonly MorphTrack[], background: string): MorphRenderer {
  const images: HTMLImageElement[] = [];
  const items = tracks.map(track => {
    const outer = document.createElement("div");
    const bw = Math.max(track.from.width, track.to.width);
    const bh = Math.max(track.from.height, track.to.height);
    Object.assign(outer.style, { position: "absolute", width: `${bw}px`, height: `${bh}px`, transformOrigin: "0 0", background });
    const photo = (source?: HTMLImageElement) => {
      const surface = document.createElement("div");
      Object.assign(surface.style, { position: "absolute", inset: "0", background });
      let image: HTMLImageElement | undefined;
      if (source) {
        image = source.cloneNode(false) as HTMLImageElement;
        image.removeAttribute("id");
        image.removeAttribute("class");
        image.removeAttribute("style");
        image.removeAttribute("srcset");
        image.removeAttribute("sizes");
        image.alt = "";
        image.loading = "eager";
        image.draggable = false;
        Object.assign(image.style, { position: "absolute", width: `${source.naturalWidth}px`, height: `${source.naturalHeight}px`, maxWidth: "none", transformOrigin: "0 0" });
        surface.appendChild(image);
        images.push(image);
      }
      outer.appendChild(surface);
      return { surface, image, source };
    };
    const outgoing = photo(track.outgoing);
    const incoming = track.incoming === track.outgoing ? undefined : photo(track.incoming);
    root.appendChild(outer);
    return { track, outer, bw, bh, outgoing, incoming };
  });
  return {
    ready: () => images.every(usable),
    draw(p) {
      const dissolve = p * p * (3 - 2 * p);
      for (const item of items) {
        const rect = morphRect(item.track, p);
        item.outer.style.transform = `translate(${rect.x}px, ${rect.y}px)`;
        const radius = (item.track.fromRadius ?? 0) * (1 - p) + (item.track.toRadius ?? 0) * p;
        item.outer.style.clipPath = `inset(0px ${Math.max(0, item.bw - rect.width)}px ${Math.max(0, item.bh - rect.height)}px 0px round ${radius}px)`;
        for (const photo of [item.outgoing, item.incoming]) {
          if (!photo?.image || !photo.source) continue;
          const fit = morphPhotoFit(photo.source.naturalWidth, photo.source.naturalHeight, rect.width, rect.height, p);
          photo.image.style.transform = `translate(${fit.x}px, ${fit.y}px) scale(${fit.scale})`;
        }
        if (item.incoming) item.incoming.surface.style.opacity = String(dissolve);
      }
    },
    dispose() { images.length = 0; items.length = 0; },
  };
}

