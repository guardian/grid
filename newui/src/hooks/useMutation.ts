import { fetchImageById } from '@/api/images';
import { getMetadataEditorUrl } from '@/config/clientConfig';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { updateImageData } from '@/store/imagesSlice';
import type { ImageResponse, ImageData, ImageMetadata } from '@/types/api';
import { useState } from 'react';

const MAX_ATTEMPTS = 10;
const POLL_INTERVAL_MS = 500;

export function saveUpdatedMetadata(update: Partial<ImageMetadata>) {
  return async (image: ImageData) => {
    const url = getMetadataEditorUrl(`/metadata/${image.id}/metadata`);

    const mergedMetadata = { ...image.userMetadata, ...update };

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ data: mergedMetadata }),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  };
}

export function checkMetadataUpdateApplied(
  metadataUpdate: Partial<ImageMetadata>,
) {
  return async (image: ImageData): Promise<boolean> => {
    return Object.keys(metadataUpdate).every(
      (k) =>
        (image.metadata as Record<string, any>)[k] ===
        (metadataUpdate as Record<string, any>)[k],
    );
  };
}

type MutationOptions = {
  imageIds: string[];
};
export function useMutation(opts: MutationOptions) {
  const dispatch = useAppDispatch();
  const { images } = useAppSelector((state) => state.images);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<null | string>(null);

  const handleSave = async function (
    saveToApi: (image: ImageData) => Promise<void>,
    checkUpdateApplied: (data: ImageData) => Promise<boolean>,
  ) {
    if (opts.imageIds.length === 0) return;

    // FIXME better handling if an image is missing from store? makes no sense
    const theseImages = opts.imageIds
      .map((id) => images.find((image) => image.data.id === id))
      .filter((i) => i !== undefined);

    setIsSaving(true);

    try {
      const updatePromises = theseImages.map(async (image) => {
        return saveToApi(image.data);
      });
      await Promise.all(updatePromises);
      const pollPromises = opts.imageIds.map(async (imageId) => {
        let attempts = 0;
        let updated = false;

        while (attempts < MAX_ATTEMPTS && !updated) {
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

          try {
            const currentData = await fetchImageById(imageId);
            const isUpdated = await checkUpdateApplied(currentData.data);

            if (isUpdated) {
              dispatch(
                updateImageData({
                  imageId: imageId,
                  data: currentData.data,
                }),
              );
              updated = true;
            }
          } catch (pollError) {
            // FIXME better handling
            console.log('Error polling for update', pollError);
            setError('Error when checking for update being applied');
          }
          attempts++;
        }
        if (!updated) {
          // FIXME better handling here too
          console.log(
            'Update was not applied to backend after 5s, where did it all go wrong?',
          );
          setError(
            'Update was not applied to backend after 5s, where did it all go wrong?',
          );
        }
      });

      await Promise.all(pollPromises);
    } catch (error) {
      console.log('unknown save fail');
    } finally {
      setIsSaving(false);
    }
  };

  return { isSaving, error, handleSave };
}
