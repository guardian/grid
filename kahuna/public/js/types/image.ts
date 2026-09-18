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

export type GridImage = {
  data: {
    id: string;
  };
};
