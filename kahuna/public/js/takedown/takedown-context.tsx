import * as React from "react";
import { createContext, useContext, useEffect, useState } from "react";
import { CapiUsage, GridImage, MediaApiRoot } from "../types/image";
import { TakedownStepStatus } from "./takedown-step";

export type TakedownStepId = "delete-from-content" | "delete-from-grid";

const ACTIVE_CONTENT_POLL_INTERVAL_MS = 3_000;
const NO_ACTIVE_CONTENT_POLL_INTERVAL_MS = 10_000;

type TakedownContextValue = {
  activeContent: CapiUsage[] | null;
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
  mediaApiRoot: MediaApiRoot;
  stepIds: TakedownStepId[];
  children: React.ReactNode;
};

export const TakedownContextProvider: React.FC<
  TakedownContextProviderProps
> = ({ image, mediaApiRoot, stepIds, children }) => {
  const [activeContent, setActiveContent] = useState<CapiUsage[] | null>(null);
  const [activeContentLoading, setActiveContentLoading] = useState(false);

  useEffect(() => {
    if (!image) {
      return;
    }

    let cancelled = false;

    const fetchActiveContent = async (): Promise<CapiUsage[]> => {
      // Use `.get()` rather than `.getData()` on the followed resource:
      // theseus Resources cache their response at construction time, so
      // `.getData()` on the same Resource instance would keep replaying the
      // response from when it was first followed. `.get()` performs a fresh
      // HTTP GET each time.
      const capiUsagesResource = await mediaApiRoot
        .follow("capiUsages", { id: image.data.id })
        .get();
      const capiUsages = await capiUsagesResource.getData();

      if (!cancelled) {
        setActiveContent(capiUsages);
      }
      return capiUsages;
    };

    let timeoutId: ReturnType<typeof setTimeout>;

    const scheduleNextPoll = (delayMs: number) => {
      if (cancelled) {
        return;
      }
      timeoutId = setTimeout(poll, delayMs);
    };

    const poll = async () => {
      setActiveContentLoading(true);
      try {
        const latestContent = await fetchActiveContent();
        scheduleNextPoll(
          latestContent.length === 0
            ? NO_ACTIVE_CONTENT_POLL_INTERVAL_MS
            : ACTIVE_CONTENT_POLL_INTERVAL_MS
        );
      } catch (error) {
        console.error("Failed to fetch active content for takedown: ", error);
      } finally {
        if (!cancelled) {
          setActiveContentLoading(false);
        }
      }
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
      cancelled = true;
      clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [image, mediaApiRoot]);

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
