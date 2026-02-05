import type { Lease } from '@/types/api';
import { getRootUri } from '@/config/clientConfig';

/**
 * Get the leases API base URL
 */
function getLeasesApiUrl(path: string): string {
  const rootUri = getRootUri();
  // Extract the domain from rootUri and construct leases API URL
  // e.g., https://media.local.dev-gutools.co.uk -> https://media-leases.local.dev-gutools.co.uk
  const leasesUri = rootUri.replace('media.', 'media-leases.');
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  return `${leasesUri}/${normalizedPath}`;
}

/**
 * Delete a lease by ID
 */
export async function deleteLease(leaseId: string): Promise<void> {
  const url = getLeasesApiUrl(`leases/${leaseId}`);

  const response = await fetch(url, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
}

/**
 * Create a new lease
 */
export async function createLease(lease: Omit<Lease, 'id' | 'createdAt' | 'leasedBy'>): Promise<{ leaseId: string}> {
  const url = getLeasesApiUrl('leases');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({
      ...lease,
      createdAt: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return (await response.json()) as { leaseId: string };
}
