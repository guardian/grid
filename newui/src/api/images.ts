import type { ImageListResponse, ImageResponse } from '@/types/api';

const MEDIA_API_BASE_URL = 'https://api.media.local.dev-gutools.co.uk';

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
    `${MEDIA_API_BASE_URL}/images?q=${query}&length=${length}&offset=${offset}`,
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
  const response = await fetch(`${MEDIA_API_BASE_URL}/images/${imageId}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data: ImageResponse = await response.json();
  return data;
}
