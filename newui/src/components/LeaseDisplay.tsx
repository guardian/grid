import type { Lease, ImageData } from '@/types/api';

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
 * Lease display component with hover details
 */
export function LeaseDisplay({ lease }: { lease: Lease }) {
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
      <div className="text-sm text-gray-900 space-y-1">
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

export function LeasesDisplay({ imageDatas }: { imageDatas: ImageData[] }) {
  const nImagesWithLeases = imageDatas.filter(
    (imageData) => imageData.leases.data.leases.length > 0,
  ).length;
  return (
    <div className="mt-6 pt-6 border-t border-gray-200">
      <div className="text-xs font-semibold text-gray-500 uppercase mb-3">
        Leases
      </div>
      {imageDatas.length > 1 ? (
        <div className="text-sm text-gray-400 italic">
          {nImagesWithLeases === 1
            ? '1 selected image has leases'
            : `${nImagesWithLeases} selected images have leases`}
        </div>
      ) : (
        imageDatas[0].leases.data.leases.map((lease) => (
          <LeaseDisplay key={lease.id} lease={lease} />
        ))
      )}
    </div>
  );
}
