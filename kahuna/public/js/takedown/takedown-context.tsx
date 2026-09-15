import * as React from "react";
import { createContext, useContext, useEffect, useState } from "react";
import { Crop, GridImage, Usage } from "../types/image";
import { TakedownStepStatus } from "./takedown-step";

export type TakedownStepId =
  | "delete-from-content"
  | "delete-from-grid"
  | "purge-cache";

const POLL_INTERVAL_MS = 3_000;

const shouldDeleteUsage = (usage: Usage) =>
  usage.platform === "digital" &&
  (usage.status === "published" || usage.status === "pending");

const is404 = (error: unknown): boolean =>
  Boolean(
    error &&
    typeof error === "object" &&
    "status" in error &&
    (error as { status: unknown }).status === 404
  );

type TakedownContextValue = {
  activeContent: Usage[] | null;
  activeContentLoading: boolean;
  usages: Usage[] | null;
  usagesLoading: boolean;
  crops: Crop[] | null;
  cropsLoading: boolean;
  activeStepId: TakedownStepId;
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
  stepIds: TakedownStepId[];
  children: React.ReactNode;
};

export const TakedownContextProvider: React.FC<
  TakedownContextProviderProps
> = ({ image, stepIds, children }) => {
  const [activeContent, setActiveContent] = useState<Usage[] | null>(null);
  const [activeContentLoading, setActiveContentLoading] = useState(false);

  const [usages, setUsages] = useState<Usage[] | null>(null);
  const [usagesLoading, setUsagesLoading] = useState(false);

  const [crops, setCrops] = useState<Crop[] | null>(null);
  const [cropsLoading, setCropsLoading] = useState(false);

  const fetchActiveContent = async () => {
    if (!image) {
      return;
    }

    setActiveContentLoading(true);
    try {
      // @TODO: Fetch for CAPI content from Media API rather than usages, once
      // that endpoint is available.
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
      setActiveContent(fetchedUsages.filter(shouldDeleteUsage));
    } catch (error) {
      // media-api returns a 404 for an image with no usages at all, rather
      // than an empty collection - treat that as "no usages", not an error.
      if (is404(error)) {
        setActiveContent([]);
        return;
      }
      throw error;
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
    const poll = async () => {
      await Promise.all([fetchActiveContent(), fetchUsages(), fetchCrops()]);
    };

    poll();
    let intervalId = setInterval(poll, POLL_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        poll();
        intervalId = setInterval(poll, POLL_INTERVAL_MS);
      } else {
        clearInterval(intervalId);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [image]);

  const deleteFromContentComplete =
    activeContent !== null && activeContent.length === 0;
  const deleteFromGridComplete =
    deleteFromContentComplete &&
    usages !== null &&
    usages.length === 0 &&
    crops !== null &&
    crops.length === 0;

  const activeStepId = !deleteFromContentComplete
    ? "delete-from-content"
    : !deleteFromGridComplete
      ? "delete-from-grid"
      : "purge-cache";

  const getStepStatus = (stepId: TakedownStepId): TakedownStepStatus => {
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
