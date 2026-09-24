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
};

// `crops` is not embedded on the image entity (unlike `usages`), it's only a
// link - so it's reached via `.follow(rel)`, which returns a lazy resource
// with no cached response, then `.get()` performs the actual HTTP GET.
export type FollowableResource = {
  get: () => Promise<CropsResource>;
};

export type GridImage = {
  data: {
    id: string;
    usages: UsagesResource;
  };
  follow: (rel: string) => FollowableResource;
};
