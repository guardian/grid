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

export type GridImage = {
  data: {
    id: string;
    usages: UsagesResource;
  };
};
