import { useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import type { ImageData, Lease } from '@/types/api';
import { useBatchUpdate } from '@/hooks/useBatchUpdate';
import { useFieldUpdateStatus } from '@/hooks/useFieldUpdateStatus';

/**
 * Format a date as a friendly relative string (e.g., "in 2 days", "2 days ago")
 */
function formatFriendlyDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));

  if (diffMs > 0) {
    if (diffDays > 0) {
      return `in ${diffDays} day${diffDays === 1 ? '' : 's'}`;
    }
    if (diffHours > 0) {
      return `in ${diffHours} hour${diffHours === 1 ? '' : 's'}`;
    }
    return 'soon';
  } else {
    if (diffDays < 0) {
      return `${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'} ago`;
    }
    if (diffHours < 0) {
      return `${Math.abs(diffHours)} hour${Math.abs(diffHours) === 1 ? '' : 's'} ago`;
    }
    return 'just now';
  }
}

/**
 * Lease display component with hover details.
 *
 * Deletes are dispatched through the batch update framework
 * (`lease.delete` operation type) so they follow the same
 * mutate → poll → store-update lifecycle as every other mutation.
 */
export function LeaseDisplay({
  lease,
  imageId,
}: {
  lease: Lease;
  imageId: string;
}) {
  const { execute } = useBatchUpdate();
  const { isUpdating: isDeleting } = useFieldUpdateStatus(
    [imageId],
    `lease.delete.${lease.id}`,
  );

  const handleDelete = () => {
    if (!confirm('Are you sure you want to delete this lease?')) {
      return;
    }
    execute('lease.delete', `lease.delete.${lease.id}`, [imageId], {
      leaseId: lease.id,
    });
  };

  const startDate = lease.startDate ? new Date(lease.startDate) : null;
  const endDate = lease.endDate ? new Date(lease.endDate) : null;
  const friendlyStart = lease.startDate
    ? formatFriendlyDate(lease.startDate)
    : null;
  const friendlyEnd = lease.endDate
    ? formatFriendlyDate(lease.endDate)
    : 'Never expires';
  const exactStartTime = startDate?.toLocaleString();
  const exactEndTime = endDate?.toLocaleString();

  return (
    <div className="mb-4 p-3 bg-gray-50 rounded border border-gray-200 group relative">
      <div className="flex justify-between items-start gap-2">
        <div className="text-sm text-gray-900 space-y-1 flex-1">
          <div>
            <span className="font-semibold">{lease.access}</span>
          </div>
          {friendlyStart && (
            <div className="text-xs text-gray-600">Starts: {friendlyStart}</div>
          )}
          <div className="text-xs text-gray-600">Ends: {friendlyEnd}</div>
          {lease.notes && (
            <div className="text-xs text-gray-700 mt-2 italic">
              Notes: {lease.notes}
            </div>
          )}
        </div>
        <button
          onClick={handleDelete}
          disabled={isDeleting}
          className="p-1 text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
          title="Delete lease"
        >
          {isDeleting ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Trash2 size={16} />
          )}
        </button>
      </div>

      {/* Hover tooltip with detailed info */}
      <div className="hidden group-hover:block absolute z-10 bottom-full left-0 mb-2 p-3 bg-gray-900 text-white rounded shadow-lg text-xs whitespace-nowrap">
        <div className="mb-1">
          <strong>Leased by:</strong> {lease.leasedBy}
        </div>
        <div className="mb-1">
          <strong>Created:</strong> {new Date(lease.createdAt).toLocaleString()}
        </div>
        {exactStartTime && (
          <div className="mb-1">
            <strong>Starts:</strong> {exactStartTime}
          </div>
        )}
        {exactEndTime && (
          <div>
            <strong>Ends:</strong> {exactEndTime}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Displays all leases for the selected image(s) and provides
 * create / delete actions via the batch update framework.
 *
 * All mutations go through `useBatchUpdate` → `startBatchUpdate` action →
 * listener middleware → mutation registry, ensuring consistent
 * mutate → poll → store-update behaviour.
 */
export function LeasesDisplay({
  imageDatas,
}: {
  imageDatas: Array<ImageData>;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const { execute } = useBatchUpdate();

  const imageIds = imageDatas.map((img) => img.id);
  const { isUpdating: isCreateInProgress } = useFieldUpdateStatus(
    imageIds,
    'lease.create',
  );

  const nImagesWithLeases = imageDatas.filter(
    (imageData) => imageData.leases.data.leases.length > 0,
  ).length;

  const handleCreateLease = () => {
    // For now, create a basic allow-use lease for the first image.
    // In a real implementation, this would show a form.
    if (imageDatas.length === 0) return;

    const mediaId = imageDatas[0].id;
    const now = new Date();
    const endDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

    setIsCreating(true);

    execute('lease.create', 'lease.create', [mediaId], {
      startDate: now.toISOString(),
      endDate: endDate.toISOString(),
      access: 'allow-use' as const,
      notes: '',
      mediaId,
      active: true,
    });

    // Reset local flag on next tick — the batch framework tracks progress
    // from here via isCreateInProgress.
    setIsCreating(false);
  };

  return (
    <div className="mb-4 pb-4 border-b border-gray-200">
      <div className="flex justify-between items-center mb-3">
        <div className="text-xs font-semibold text-gray-500 uppercase">
          Leases
        </div>
        {imageDatas.length === 1 && (
          <button
            onClick={handleCreateLease}
            disabled={isCreating || isCreateInProgress}
            className="p-1 text-blue-600 hover:bg-blue-50 rounded disabled:opacity-50"
            title="Create lease"
          >
            {isCreateInProgress ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Plus size={16} />
            )}
          </button>
        )}
      </div>
      {imageDatas.length > 1 ? (
        <div className="text-sm text-gray-400 italic">
          {nImagesWithLeases === 1
            ? '1 selected image has leases'
            : `${nImagesWithLeases} selected images have leases`}
        </div>
      ) : (
        imageDatas[0].leases.data.leases.map((lease) => (
          <LeaseDisplay
            key={lease.id}
            lease={lease}
            imageId={imageDatas[0].id}
          />
        ))
      )}
    </div>
  );
}
