import type { ImageListResponse, ImageResponse } from '@/types/api';
import { getMediaApiUrl, getMetadataEditorUrl } from '@/config/clientConfig';

interface FetchImagesParams {
  query?: string;
  length?: number;
  offset?: number;
}

/**
 * Fetch a list of images with optional search query and pagination
 */
export async function fetchImagesList(
  params: FetchImagesParams = {},
): Promise<ImageListResponse> {
  const { query = '', length = 10, offset = 0 } = params;

  const response = await fetch(
    getMediaApiUrl(`images?q=${query}&length=${length}&offset=${offset}`),
    { credentials: 'include' },
  );

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data: ImageListResponse = await response.json();
  return data;
}

/**
 * Fetch a single image by ID
 */
export async function fetchImageById(imageId: string): Promise<ImageResponse> {
  const response = await fetch(getMediaApiUrl(`images/${imageId}`), {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data: ImageResponse = await response.json();
  return data;
}

/**
 * Update a single metadata field for an image via the metadata editor API.
 * The backend responds with 202 Accepted — the change is queued, not yet applied.
 */
export async function putMetadataField(
  imageId: string,
  field: string,
  value: string,
): Promise<void> {
  const url = getMetadataEditorUrl(`metadata/${imageId}/metadata`);

  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      data: { [field]: value },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Metadata update failed for ${imageId}: HTTP ${response.status}`,
    );
  }
}
