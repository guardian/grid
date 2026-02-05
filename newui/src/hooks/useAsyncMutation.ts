import { useState } from 'react';
import { fetchImageById } from '@/api/images';
import { useAppDispatch } from '@/store/hooks';
import { updateImageData } from '@/store/imagesSlice';

interface AsyncMutationOptions<T> {
  /**
   * The mutation function to execute (e.g., API call to create/update/delete)
   */
  mutateFn: () => Promise<T>;
  
  /**
   * Poll function that checks if the mutation has been applied
   * Should return true when the change is confirmed in the API response
   */
  pollFn: (imageId: string) => Promise<boolean>;
  
  /**
   * The image ID to poll and update
   */
  imageId: string;
  
  /**
   * Optional callback on success
   */
  onSuccess?: () => void;
  
  /**
   * Optional callback on error
   */
  onError?: (error: Error) => void;
  
  /**
   * Maximum polling attempts (default: 10)
   */
  maxAttempts?: number;
  
  /**
   * Polling interval in milliseconds (default: 500)
   */
  pollInterval?: number;
}

/**
 * Hook for handling asynchronous mutations with polling and Redux updates
 * 
 * Common pattern:
 * 1. Execute mutation (create/update/delete API call)
 * 2. Poll the image API to verify the change was applied
 * 3. Update Redux store when confirmed
 * 4. Handle loading states and errors
 * 
 * @example
 * const { execute, isLoading, error } = useAsyncMutation({
 *   mutateFn: () => deleteLease(leaseId),
 *   pollFn: async (imageId) => {
 *     const response = await fetchImageById(imageId);
 *     return !response.data.leases.data.leases.some(l => l.id === leaseId);
 *   },
 *   imageId: 'abc123',
 *   onSuccess: () => console.log('Lease deleted'),
 * });
 */
export function useAsyncMutation<T = void>(options: AsyncMutationOptions<T>) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dispatch = useAppDispatch();

  const execute = async (): Promise<boolean> => {
    const {
      mutateFn,
      pollFn,
      imageId,
      onSuccess,
      onError,
      maxAttempts = 10,
      pollInterval = 500,
    } = options;

    setIsLoading(true);
    setError(null);

    try {
      // Execute the mutation
      await mutateFn();

      // Poll until the change is confirmed
      let attempts = 0;
      let confirmed = false;

      while (attempts < maxAttempts && !confirmed) {
        await new Promise((resolve) => setTimeout(resolve, pollInterval));

        try {
          const isApplied = await pollFn(imageId);

          if (isApplied) {
            // Change confirmed, update Redux store
            const imageResponse = await fetchImageById(imageId);
            dispatch(
              updateImageData({
                imageId,
                data: imageResponse.data,
              }),
            );
            confirmed = true;
          }
        } catch (pollError) {
          console.error('Polling error:', pollError);
        }

        attempts++;
      }

      if (!confirmed) {
        const timeoutError = new Error(
          'Mutation polling timed out, but changes may still be processing',
        );
        console.warn(timeoutError.message);
        setError(timeoutError.message);
        onError?.(timeoutError);
        return false;
      }

      onSuccess?.();
      return true;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Mutation failed';
      console.error('Mutation error:', err);
      setError(errorMessage);
      onError?.(err instanceof Error ? err : new Error(errorMessage));
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    execute,
    isLoading,
    error,
  };
}
