/**
 * Hook to check whether a specific metadata field is currently being
 * updated for any of the given images, and to surface any errors.
 *
 * Usage:
 * ```tsx
 * const { isUpdating, error } = useFieldUpdateStatus(imageIds, 'title');
 * ```
 */

import type { RootState } from '@/store/store';
import { useAppSelector } from '@/store/hooks';
import {
  selectFieldError,
  selectIsFieldUpdatingForAny,
} from '@/store/asyncUpdates';

export interface FieldUpdateStatus {
  /** True while any image in the list has an active update for this field */
  isUpdating: boolean;
  /** The first error found for this field across active batches, if any */
  error: string | undefined;
}

export function useFieldUpdateStatus(
  imageIds: Array<string>,
  field: string,
): FieldUpdateStatus {
  const isUpdating = useAppSelector((state: RootState) =>
    selectIsFieldUpdatingForAny(state, imageIds, field),
  );

  const error = useAppSelector((state: RootState) =>
    selectFieldError(state, imageIds, field),
  );

  return { isUpdating, error };
}
