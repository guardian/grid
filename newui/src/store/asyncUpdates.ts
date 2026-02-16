

export type AsyncUpdate = {
    imageId: string;
    field: string;
      status: 'pending' | 'polling' | 'success' | 'error' | 'timeout';
  startedAt: number;
  completedAt?: number;
  error?: string;
  retryCount: number;
}


export type AsyncUpdateState = {

    ongoingUpdates: Record<string, AsyncUpdate>;
}