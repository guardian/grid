/**
 * Hook to check whether a specific field is currently being updated
 * for any of the given images, and to surface any errors.
 *
 * Use this alongside `useBatchUpdate` to show per-field loading and
 * error states.  The `field` parameter matches the field string passed
 * to `useBatchUpdate.execute()` — it can be a metadata key like
 * `'title'` or a scoped key like `'lease.delete.${leaseId}'`.
 *
 * Usage:
 * ```tsx
 * const { isUpdating, error } = useFieldUpdateStatus(imageIds, 'title');
 * const { isUpdating: isDeleting } = useFieldUpdateStatus([imageId], `lease.delete.${leaseId}`);
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
