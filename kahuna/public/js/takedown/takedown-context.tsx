import * as React from "react";
import { createContext, useContext, useEffect, useState } from "react";
import { GridImage, Usage } from "../types/image";
import { TakedownStepStatus } from "./takedown-step";

export type TakedownStepId =
  | "delete-from-content"
  | "delete-from-grid"
  | "purge-cache";

const LIVE_USAGES_POLL_INTERVAL_MS = 3_000;

const shouldDeleteUsage = (usage: Usage) =>
  usage.platform === "digital" &&
  (usage.status === "published" || usage.status === "pending");

type TakedownContextValue = {
  activeContent: Usage[] | null;
  activeContentLoading: boolean;
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
  const [activeContent, setLiveUsages] = useState<Usage[]>([]);
  const [activeContentLoading, setActiveContentLoading] = useState(false);

  useEffect(() => {
    if (!image) {
      return;
    }

    let cancelled = false;

    const fetchActiveContent = async () => {
      try {
        // @TODO: Fetch for CAPI content from Media API rather than usages
        // Use `.get()` rather than `.getData()` on the usages resource: theseus
        // Resources cache their response at construction time, so `.getData()`
        // on the same Resource instance would keep replaying the response from
        // when `image` was first fetched, never reflecting usages
        // added/removed since. `.get()` performs a fresh HTTP GET each time.
        const usagesResource = await image.data.usages.get();
        const usageResources = await usagesResource.getData();
        const usages = await Promise.all(
          usageResources.map((usageResource) => usageResource.getData())
        );

        if (!cancelled) {
          setLiveUsages(usages.filter(shouldDeleteUsage));
        }
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "status" in error &&
          error.status === 404
        ) {
          setLiveUsages([]);
          return;
        }
        throw error;
      }
    };

    const poll = async () => {
      setActiveContentLoading(true);
      try {
        await fetchActiveContent();
      } finally {
        if (!cancelled) {
          setActiveContentLoading(false);
        }
      }
    };

    poll();
    let intervalId = setInterval(poll, LIVE_USAGES_POLL_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        poll();
        intervalId = setInterval(poll, LIVE_USAGES_POLL_INTERVAL_MS);
      } else {
        clearInterval(intervalId);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [image]);

  const deleteFromContentComplete =
    activeContent !== null && activeContent.length === 0;
  const activeStepId = deleteFromContentComplete
    ? "delete-from-grid"
    : "delete-from-content";

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
        activeStepId,
        getStepStatus
      }}
    >
      {children}
    </TakedownContext.Provider>
  );
};
