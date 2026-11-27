import { useMemo, useSyncExternalStore } from "react";
import { getCropSettings, getCropSettingsRevision, subscribeCropSettings } from "@/lib/crop/crop-options";

export function useCropSettings() {
  const revision = useSyncExternalStore(subscribeCropSettings, getCropSettingsRevision);
  const settings = useMemo(() => getCropSettings(), [revision]);
  return { settings, revision };
}