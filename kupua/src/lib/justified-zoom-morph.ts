export interface MorphRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MorphTile extends MorphRect {
  id: string;
  image?: HTMLImageElement;
  protected: boolean;
  radius?: number;
}

export interface MorphTrack {
  from: MorphRect;
  to: MorphRect;
  outgoing?: HTMLImageElement;
  incoming?: HTMLImageElement;
  fromRadius?: number;
  toRadius?: number;
}

interface Row { y: number; height: number; tiles: MorphTile[] }

function rows(tiles: readonly MorphTile[]): Row[] {
  const result: Row[] = [];
  for (const tile of [...tiles].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const last = result.at(-1);
    if (last && Math.abs(last.y - tile.y) < 0.5) last.tiles.push(tile);
    else result.push({ y: tile.y, height: tile.height, tiles: [tile] });
  }
  return result;
}

function anchorRow(list: Row[], y: number): number {
  let best = 0;
  let distance = Infinity;
  list.forEach((row, index) => {
    const next = Math.max(row.y - y, y - row.y - row.height, 0);
    if (next < distance) { distance = next; best = index; }
  });
  return best;
}

function rowAt(list: Row[], index: number): Row {
  return list[index] ?? { y: index < 0 ? list[0].y : list.at(-1)!.y + list.at(-1)!.height, height: 0, tiles: [] };
}

function slot(row: Row, index: number, fallbackX: number): MorphRect {
  const tile = row.tiles[index];
  return { x: tile?.x ?? (row.tiles.at(-1) ? row.tiles.at(-1)!.x + row.tiles.at(-1)!.width : fallbackX), y: row.y, width: tile?.width ?? 0, height: row.height };
}

// Row/slot order is deliberately preferred over long identity flights across row breaks.
export function planZoomMorph(source: readonly MorphTile[], destination: readonly MorphTile[], anchorY: number, maxTracks: number,
  pinnedId?: string): MorphTrack[] | undefined {
  if (!source.length || !destination.length || [...source, ...destination].some(tile => tile.protected || ![tile.x, tile.y, tile.width, tile.height].every(Number.isFinite) || tile.width <= 0 || tile.height <= 0)) return;
  const a = rows(source);
  const b = rows(destination);
  const ai = anchorRow(a, anchorY);
  const bi = anchorRow(b, anchorY);
  const pinnedSource = pinnedId ? source.find(tile => tile.id === pinnedId) : undefined;
  const pinnedDestination = pinnedSource ? destination.find(tile => tile.id === pinnedId) : undefined;
  const pinned = pinnedSource && pinnedDestination ? pinnedId : undefined;
  const tracks: MorphTrack[] = [];
  for (let relative = Math.min(-ai, -bi); relative < Math.max(a.length - ai, b.length - bi); relative++) {
    const from = rowAt(a, ai + relative);
    const to = rowAt(b, bi + relative);
    for (let index = 0; index < Math.max(from.tiles.length, to.tiles.length); index++) {
      const outgoing = from.tiles[index];
      const incoming = to.tiles[index];
      if (pinned && outgoing?.id === pinned && incoming?.id === pinned) continue;
      if (tracks.length >= maxTracks) return;
      tracks.push({
        from: slot(from, index, to.tiles[0]?.x ?? 0),
        to: slot(to, index, from.tiles[0]?.x ?? 0),
        outgoing: pinned && outgoing?.id === pinned ? undefined : outgoing?.image,
        incoming: pinned && incoming?.id === pinned ? undefined
          : outgoing?.id === incoming?.id && outgoing?.image ? outgoing.image : incoming?.image,
        fromRadius: outgoing?.radius ?? incoming?.radius ?? 0,
        toRadius: incoming?.radius ?? outgoing?.radius ?? 0,
      });
    }
  }
  if (pinned && pinnedSource && pinnedDestination) {
    if (tracks.length >= maxTracks) return;
    tracks.push({ from: pinnedSource, to: pinnedDestination,
      outgoing: pinnedSource.image, incoming: pinnedSource.image ?? pinnedDestination.image,
      fromRadius: pinnedSource.radius, toRadius: pinnedDestination.radius });
  }
  return tracks;
}

export function morphRect(track: MorphTrack, progress: number): MorphRect {
  const p = Math.max(0, Math.min(1, progress));
  const lerp = (a: number, b: number) => a + (b - a) * p;
  return { x: lerp(track.from.x, track.to.x), y: lerp(track.from.y, track.to.y), width: lerp(track.from.width, track.to.width), height: lerp(track.from.height, track.to.height) };
}

export interface PhotoFit { x: number; y: number; width: number; height: number; scale: number }

// Use cover in transit, but land on the real list's contain fit, even for ratio mismatches.
export function morphPhotoFit(iw: number, ih: number, width: number, height: number, progress: number): PhotoFit {
  if (iw <= 0 || ih <= 0 || width <= 0 || height <= 0) return { x: 0, y: 0, width: 0, height: 0, scale: 0 };
  const p = Math.max(0, Math.min(1, progress));
  const edge = Math.min(1, p / 0.12, (1 - p) / 0.12);
  const cover = edge * edge * (3 - 2 * edge);
  const containScale = Math.min(width / iw, height / ih);
  const scale = containScale + (Math.max(width / iw, height / ih) - containScale) * cover;
  return { x: (width - iw * scale) / 2, y: (height - ih * scale) / 2, width: iw * scale, height: ih * scale, scale };
}
