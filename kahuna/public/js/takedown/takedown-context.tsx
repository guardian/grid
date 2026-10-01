import * as React from "react";
import { createContext, useContext, useEffect, useState } from "react";
import {
  CapiUsage,
  GridImage,
  LeasesResource,
  MediaApiRoot,
  Usage
} from "../types/image";
import { TakedownStepStatus } from "./takedown-step";
import { pollUntil } from "../util/poll";
import { is404 } from "../util/errors";

export type TakedownStepId = "delete-from-content" | "delete-from-grid";
export type DeleteFromGridStatus =
  | "soft-deleted"
  | "hard-deleted"
  | "denied-lease";

const ACTIVE_CONTENT_POLL_INTERVAL_MS = 3_000;
const NO_ACTIVE_CONTENT_POLL_INTERVAL_MS = 10_000;

const hasPermanentDenyLease = (
  leases: { access: string; endDate?: string }[]
): boolean =>
  leases.some((lease) => lease.access === "deny-use" && !lease.endDate);

const getDeleteFromGridStatus = async (image: GridImage | null) => {
  if (!image) {
    return "hard-deleted";
  }

  try {
    const imageData = await image.get();

    if (Boolean(imageData.data.softDeletedMetadata)) {
      return "soft-deleted";
    }

    const leasesResource = await imageData
      .follow<LeasesResource>("leases")
      .get();
    const { leases } = await leasesResource.getData();
    if (hasPermanentDenyLease(leases)) {
      return "denied-lease";
    }

    return null;
  } catch (error) {
    if (is404(error)) {
      return "hard-deleted";
    }
    throw error;
  }
};

type TakedownContextValue = {
  activeContent: CapiUsage[] | null;
  activeContentLoading: boolean;
  activeStepId: TakedownStepId | null;
  deleteFromGridStatus: DeleteFromGridStatus | null;
  getStepStatus: (stepId: TakedownStepId) => TakedownStepStatus;
  onDelete: (expectedStatus: DeleteFromGridStatus) => Promise<void>;
  usages: Usage[] | null;
  usagesLoading: boolean;
  fetchUsages: () => Promise<void>;
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

  const [deleteFromGridStatus, setDeleteFromGridStatus] =
    useState<DeleteFromGridStatus | null>(null);

  useEffect(() => {
    const fetchDeleteFromGridStatus = async () => {
      const deleteFromGridStatus = await getDeleteFromGridStatus(image);
      setDeleteFromGridStatus(deleteFromGridStatus);
    };
    fetchDeleteFromGridStatus();
  }, [image]);

  // After a delete/deny-lease action, media-api's search index can take a
  // moment to catch up, so an immediate refetch may not yet reflect the
  // change. Poll briefly until it does, rather than giving up after one try.
  const onDelete = async (expectedStatus: DeleteFromGridStatus) => {
    const status = await pollUntil(
      () => getDeleteFromGridStatus(image),
      (status) => status === expectedStatus
    );
    setDeleteFromGridStatus(status);
  };

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

  useEffect(() => {
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

  useEffect(() => {
    fetchUsages();
  }, [image]);

  const deletedFromContent =
    activeContent !== null && activeContent.length === 0;
  const activeStepId =
    deletedFromContent && deleteFromGridStatus !== null
      ? null
      : deletedFromContent
        ? "delete-from-grid"
        : "delete-from-content";

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
        fetchUsages,
        activeStepId,
        deleteFromGridStatus,
        getStepStatus,
        onDelete
      }}
    >
      {children}
    </TakedownContext.Provider>
  );
};
