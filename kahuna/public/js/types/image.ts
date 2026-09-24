export type CapiUsage = {
  contentId: string;
  webTitle: string;
  webUrl: string;
  composerUrl?: string;
  publishedAt?: number;
  isLive?: boolean;
};

export type MediaApiRoot = {
  follow: (
    rel: string,
    params?: Record<string, string>
  ) => { get: () => Promise<{ getData: () => Promise<CapiUsage[]> }> };
};

export type UsageReference = {
  type: string;
  uri?: string;
  name?: string;
};

export type Usage = {
  id: string;
  platform: string;
  status: string;
  references: UsageReference[];
};

export type UsageResource = {
  getData: () => Promise<Usage>;
};

export type UsagesResource = {
  getData: () => Promise<UsageResource[]>;
  get: () => Promise<UsagesResource>;
};

export type Crop = {
  id: string;
  specification: {
    aspectRatio?: string;
  };
  master?: {
    dimensions: { width: number; height: number };
  };
};

export type CropsResource = {
  getData: () => Promise<Crop[]>;
  perform: (name: string, parameters?: { body?: unknown }) => Promise<unknown>;
};

export type FollowableResource<T> = {
  get: () => Promise<T>;
};

export type ImageAction = {
  name: string;
  href: string;
  method: string;
};

export type SoftDeletedMetadata = {
  deleteTime: string;
  deletedBy: string;
};

export type MediaLease = {
  access: string;
  // No `endDate` means the lease never expires - i.e. it's permanent.
  endDate?: string;
};

export type LeasesResource = {
  getData: () => Promise<{ leases: MediaLease[] }>;
};

export type GridImage = {
  data: {
    id: string;
    usages: UsagesResource;
    softDeletedMetadata?: SoftDeletedMetadata;
  };
  follow: <T>(rel: string) => FollowableResource<T>;
  getAction: (name: string) => Promise<ImageAction | undefined>;
  perform: (name: string, parameters?: { body?: unknown }) => Promise<unknown>;
  get: () => Promise<GridImage>;
};
