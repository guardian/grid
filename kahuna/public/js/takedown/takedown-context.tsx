import * as React from "react";
import { createContext, useContext, useEffect, useState } from "react";
import {
  CapiUsage,
  GridImage,
  MediaApiRoot,
  Crop,
  Usage
} from "../types/image";
import { TakedownStepStatus } from "./takedown-step";

export type TakedownStepId = "delete-from-content" | "delete-from-grid";

const ACTIVE_CONTENT_POLL_INTERVAL_MS = 3_000;
const NO_ACTIVE_CONTENT_POLL_INTERVAL_MS = 10_000;

const is404 = (error: unknown): boolean =>
  Boolean(
    error &&
    typeof error === "object" &&
    "status" in error &&
    (error as { status: unknown }).status === 404
  );

type TakedownContextValue = {
  activeContent: CapiUsage[] | null;
  activeContentLoading: boolean;
  usages: Usage[] | null;
  usagesLoading: boolean;
  crops: Crop[] | null;
  cropsLoading: boolean;
  activeStepId: TakedownStepId | null;
  getStepStatus: (stepId: TakedownStepId) => TakedownStepStatus;
};

const TakedownContext = createContext<TakedownContextValue | null>(null);

export const useTakedownContext = (): TakedownContextValue => {
  const context = useContext(TakedownContext);
  if (!context) {
    throw new Error(
      "useTakedownContext must be used within a TakedownContextProvider"
    );
  }
  return context;
};

type TakedownContextProviderProps = {
  image: GridImage | null;
  mediaApiRoot: MediaApiRoot;
  stepIds: TakedownStepId[];
  children: React.ReactNode;
};

export const TakedownContextProvider: React.FC<
  TakedownContextProviderProps
> = ({ image, mediaApiRoot, stepIds, children }) => {
  const [activeContent, setActiveContent] = useState<CapiUsage[] | null>(null);
  const [activeContentLoading, setActiveContentLoading] = useState(false);

  const [usages, setUsages] = useState<Usage[] | null>(null);
  const [usagesLoading, setUsagesLoading] = useState(false);

  const [crops, setCrops] = useState<Crop[] | null>(null);
  const [cropsLoading, setCropsLoading] = useState(false);

  const fetchActiveContent = async (): Promise<CapiUsage[] | undefined> => {
    if (!image) {
      return;
    }

    setActiveContentLoading(true);
    try {
      // Use `.get()` rather than `.getData()` on the followed resource:
      // theseus Resources cache their response at construction time, so
      // `.getData()` on the same Resource instance would keep replaying the
      // response from when it was first followed. `.get()` performs a fresh
      // HTTP GET each time.
      const capiUsagesResource = await mediaApiRoot
        .follow("capiUsages", { id: image.data.id })
        .get();
      const capiUsages = await capiUsagesResource.getData();
      setActiveContent(capiUsages);
      return capiUsages;
    } finally {
      setActiveContentLoading(false);
    }
  };

  const fetchUsages = async () => {
    if (!image) {
      return;
    }

    setUsagesLoading(true);
    try {
      // Use `.get()` rather than `.getData()` on the usages resource: theseus
      // Resources cache their response at construction time, so `.getData()`
      // on the same Resource instance would keep replaying the response from
      // when `image` was first fetched, never reflecting usages
      // added/removed since. `.get()` performs a fresh HTTP GET each time.
      const usagesResource = await image.data.usages.get();
      const usageResources = await usagesResource.getData();
      const fetchedUsages = await Promise.all(
        usageResources.map((usageResource) => usageResource.getData())
      );
      setUsages(fetchedUsages);
    } catch (error) {
      // media-api returns a 404 for an image with no usages at all, rather
      // than an empty collection - treat that as "no usages", not an error.
      if (is404(error)) {
        setUsages([]);
        return;
      }
      throw error;
    } finally {
      setUsagesLoading(false);
    }
  };

  const fetchCrops = async () => {
    if (!image) {
      return;
    }

    setCropsLoading(true);
    try {
      const cropsResource = await image.follow("crops").get();
      const fetchedCrops = await cropsResource.getData();
      setCrops(fetchedCrops);
    } catch (error) {
      if (is404(error)) {
        setCrops([]);
        return;
      }
      throw error;
    } finally {
      setCropsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsages();
    fetchCrops();

    let timeoutId: ReturnType<typeof setTimeout>;

    const scheduleNextPoll = (delayMs: number) => {
      timeoutId = setTimeout(poll, delayMs);
    };

    const poll = async () => {
      const latestContent = await fetchActiveContent();
      scheduleNextPoll(
        latestContent?.length === 0
          ? NO_ACTIVE_CONTENT_POLL_INTERVAL_MS
          : ACTIVE_CONTENT_POLL_INTERVAL_MS
      );
    };

    poll();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timeoutId);
        poll();
      } else {
        clearTimeout(timeoutId);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const deletedFromContent = true; // @TODO: Revert this!
  // activeContent !== null && activeContent.length === 0;
  // @TODO: This should be based on the image being deleted or denied lease
  const deletedFromGrid =
    usages !== null &&
    usages.length === 0 &&
    crops !== null &&
    crops.length === 0;
  const activeStepId =
    deletedFromContent && deletedFromGrid
      ? null
      : deletedFromContent
        ? "delete-from-grid"
        : "delete-from-content";

  useEffect(() => {
    if (deletedFromContent) {
      // Refetch usages once deleted from content to get the latest status of usages
      fetchUsages();
    }
  }, [deletedFromContent]);

  const getStepStatus = (stepId: TakedownStepId): TakedownStepStatus => {
    if (!activeStepId) {
      return "complete";
    }
    const stepIndex = stepIds.indexOf(stepId);
    const activeIndex = stepIds.indexOf(activeStepId);

    if (stepIndex < activeIndex) {
      return "complete";
    }
    if (stepIndex === activeIndex) {
      return "current";
    }
    return "locked";
  };

  return (
    <TakedownContext.Provider
      value={{
        activeContent,
        activeContentLoading,
        usages,
        usagesLoading,
        crops,
        cropsLoading,
        activeStepId,
        getStepStatus
      }}
    >
      {children}
    </TakedownContext.Provider>
  );
};
