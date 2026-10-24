export interface RectBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface AnchorCandidateRect {
  id: string;
  rect: RectBounds;
}

interface ViewportAnchorOptions {
  usableTop?: number;
  verticalOnly?: boolean;
}

export function electViewportAnchor(
  container: RectBounds,
  candidates: AnchorCandidateRect[],
  options: ViewportAnchorOptions = {},
): string | null {
  const usableTop = Math.max(container.top, options.usableTop ?? container.top);
  if (usableTop >= container.bottom || container.left >= container.right) return null;

  const centreX = (container.left + container.right) / 2;
  const centreY = (usableTop + container.bottom) / 2;
  let nearestId: string | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const { rect } = candidate;
    const intersects =
      rect.right > container.left &&
      rect.left < container.right &&
      rect.bottom > usableTop &&
      rect.top < container.bottom;
    if (!intersects) continue;

    const deltaY = (rect.top + rect.bottom) / 2 - centreY;
    const deltaX = options.verticalOnly
      ? 0
      : (rect.left + rect.right) / 2 - centreX;
    const distance = deltaX * deltaX + deltaY * deltaY;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestId = candidate.id;
    }
  }

  return nearestId;
}
