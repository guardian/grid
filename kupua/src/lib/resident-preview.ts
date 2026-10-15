import type { Image } from "@/types/image";

export const SYNTHETIC_PREVIEW_ENABLED = import.meta.env.DEV && import.meta.env.VITE_JUSTIFIED_PREVIEW === "true";
export const SAMPLED_PREVIEW_ENABLED = import.meta.env.DEV && import.meta.env.VITE_JUSTIFIED_PREVIEW === "sample";
export const RESIDENT_PREVIEW_ENABLED = SYNTHETIC_PREVIEW_ENABLED || SAMPLED_PREVIEW_ENABLED;
export const WINDOWED_JUSTIFIED_ENABLED = import.meta.env.DEV && !RESIDENT_PREVIEW_ENABLED;
export const JUSTIFIED_AVAILABLE = import.meta.env.DEV;
export const RESIDENT_PREVIEW_LIMIT = 96;

export function decoratePreviewImage(image: Image, index: number): Image {
  const [width, height] = [[300, 200], [200, 300], [240, 240], [600, 200], [200, 600], [1200, 200], [200, 1200], [400, 300]][index % 8];
  return { ...image, source: { ...image.source, dimensions: { width, height }, mimeType: "image/svg+xml" },
    metadata: { ...image.metadata, title: `Preview image ${index + 1}`,
      description: `Synthetic resident preview ${index + 1} (${width} × ${height})` } };
}

export function previewImageUrl(image: Image): string {
  const index = Number(image.id.match(/^img-(\d+)$/)?.[1] ?? 0);
  const { width, height } = image.source.orientedDimensions ?? image.source.dimensions;
  const hue = index * 47 % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="hsl(${hue} 45% 32%)"/><path d="M0 0L${width} ${height}M${width} 0L0 ${height}" stroke="hsl(${hue} 55% 65%)" stroke-width="4"/><rect x="4" y="4" width="${width - 8}" height="${height - 8}" fill="none" stroke="white" stroke-width="3"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="48" fill="white">${index + 1}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
