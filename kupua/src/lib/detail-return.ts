import { getCurrentKupuaKey, getDetailOriginKupuaKey } from "@/lib/orchestration/history-key";

export interface DetailEntry {
  readonly imageId: string;
  readonly key: string | undefined;
  readonly originKey: string | undefined;
}

export interface DetailReturnTarget {
  readonly imageId: string;
  readonly placement: "native" | "center";
}

export function chooseDetailReturn(entry: DetailEntry, imageId: string): DetailReturnTarget {
  return { imageId, placement: imageId === entry.imageId ? "native" : "center" };
}

export function captureDetailEntry(imageId: string): DetailEntry {
  return {
    imageId: (history.state as { _detailEntryImageId?: string } | null)?._detailEntryImageId ?? imageId,
    key: getCurrentKupuaKey(),
    originKey: getDetailOriginKupuaKey(),
  };
}

export function startDetailSession(imageId: string): DetailEntry {
  history.replaceState({ ...history.state, _detailEntryImageId: imageId }, "");
  return captureDetailEntry(imageId);
}