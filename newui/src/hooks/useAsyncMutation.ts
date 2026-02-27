/**
 * Simple hook for single-image async mutations with polling.
 *
 * This is used by components like LeaseDisplay that need a quick
 * mutate → poll → done lifecycle for one image at a time,
 * without going through the full batch-update framework.
 *
 * For multi-image batch operations, prefer `useBatchUpdate` instead.
 */

import { useCallback, useRef, useState } from 'react';
import { useAppDispatch } from '@/store/hooks';
import { updateImageData } from '@/store/imagesSlice';
import { fetchImageById } from '@/api/images';

interface UseAsyncMutationOptions {
  /** The function that performs the mutation (e.g. deleteLease) */
  mutateFn: () => Promise<unknown>;
  /** Poll function: receives imageId, returns true when the expected state is observed */
  pollFn: (imageId: string) => Promise<boolean>;
  /** The image to re-fetch during polling */
  imageId: string;
  /** Called after polling confirms the mutation succeeded */
  onSuccess?: () => void;
}

interface UseAsyncMutationResult {
  execute: () => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

export function useAsyncMutation({
  mutateFn,
  pollFn,
  imageId,
  onSuccess,
}: UseAsyncMutationOptions): UseAsyncMutationResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dispatch = useAppDispatch();
  const abortRef = useRef<boolean>(false);

  const execute = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    abortRef.current = false;

    try {
      await mutateFn();

      // Poll until condition is met
      const maxAttempts = 10;
      const pollInterval = 500;
      let attempts = 0;
      let verified = false;

      while (attempts < maxAttempts && !verified && !abortRef.current) {
        await new Promise((resolve) => setTimeout(resolve, pollInterval));

        try {
          verified = await pollFn(imageId);

          if (verified) {
            // Fetch latest data and update store
            const response = await fetchImageById(imageId);
            dispatch(updateImageData({ imageId, data: response.data }));
            onSuccess?.();
          }
        } catch (pollError) {
          console.error('Polling error:', pollError);
        }

        attempts++;
      }

      if (!verified && !abortRef.current) {
        console.warn(
          `Polling timed out for image ${imageId}, but changes may still be processing`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Mutation failed';
      setError(message);
      console.error('Mutation error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [mutateFn, pollFn, imageId, onSuccess, dispatch]);

  return { execute, isLoading, error };
}
