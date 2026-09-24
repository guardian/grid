import * as React from "react";
import { useState, useEffect } from "react";
import { List } from "immutable";
import { ClassNames } from "@emotion/react";
import { Typography } from "@guardian/stand/Typography";
import { Button } from "@guardian/stand/Button";
import { Select, Option } from "@guardian/stand/Select";
import { semanticSpacing } from "@guardian/stand";
import { standThemeOverride } from "../util/constants/standThemeOverride";
import { CropsResource, Crop, GridImage, Usage } from "../types/image";
import {
  useTakedownContext,
  type DeleteFromGridStatus
} from "./takedown-context";
import { CropsAndUsages } from "./crops-and-usages";
import { pollUntil } from "../util/poll";
import { is404 } from "../util/errors";

// After crops/usages are deleted, media-api's search index can take a
// moment to catch up before `delete`/`hard-delete` show up as available
// actions on the image (they depend on the image having no crops/usages
// left).
const waitForImageWithAction = async (
  image: GridImage,
  actionName: string
): Promise<GridImage> => {
  const { targetImage } = await pollUntil(
    async () => {
      const targetImage = await image.get();
      const action = await targetImage.getAction(actionName);
      return { targetImage, action };
    },
    ({ action }) => Boolean(action)
  );
  return targetImage;
};

type DeleteMethod = "hard-delete" | "soft-delete" | "deny-lease";

const DELETE_METHOD_OPTIONS: {
  id: DeleteMethod;
  label: string;
}[] = [
  {
    id: "hard-delete",
    label: "Hard Delete"
  },
  {
    id: "soft-delete",
    label: "Soft Delete"
  },
  {
    id: "deny-lease",
    label: "Deny Lease"
  }
];

const getDeleteFromGridStatusText = (status: DeleteFromGridStatus) => {
  if (status === "soft-deleted") {
    return "This image has been soft deleted from Grid. You may hard delete it if necessary.";
  }

  if (status === "hard-deleted") {
    return "This image has been hard deleted from Grid.";
  }

  if (status === "denied-lease") {
    return "This image has been denied lease in Grid. You may soft delete or hard delete it if necessary.";
  }
};

const getAvailableDeleteMethods = ({
  status,
  hasPublishedPrintUsages
}: {
  status: DeleteFromGridStatus | null;
  hasPublishedPrintUsages: boolean;
}) => {
  if (status === "hard-deleted") {
    return [];
  }

  if (status === "soft-deleted") {
    return ["hard-delete"];
  }

  if (status === "denied-lease" && !hasPublishedPrintUsages) {
    return ["hard-delete", "soft-delete"];
  }

  if (status === "denied-lease" && hasPublishedPrintUsages) {
    return [];
  }

  if (hasPublishedPrintUsages) {
    return ["deny-lease"];
  }

  return ["hard-delete", "soft-delete", "deny-lease"];
};

export const DeleteFromGridStep: React.FC<{ image: GridImage | null }> = ({
  image
}) => {
  const {
    usages,
    usagesLoading,
    fetchUsages,
    getStepStatus,
    deleteFromGridStatus,
    onDelete
  } = useTakedownContext();

  const [crops, setCrops] = useState<Crop[] | null>(null);
  const [cropsLoading, setCropsLoading] = useState(false);

  const fetchCrops = async () => {
    if (!image) {
      return;
    }

    setCropsLoading(true);
    try {
      const cropsResource = await image.follow<CropsResource>("crops").get();
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
    fetchCrops();
  }, [image]);

  const isStepLocked = getStepStatus("delete-from-grid") === "locked";

  // eslint-disable-next-line new-cap
  const [deletableUsages, publishedPrintUsages] = List<Usage>(
    usages ?? []
  ).partition(
    (usage) => usage.platform === "print" && usage.status === "published"
  );
  const hasPublishedPrintUsages = publishedPrintUsages.size > 0;

  const availableDeleteMethods = getAvailableDeleteMethods({
    status: deleteFromGridStatus,
    hasPublishedPrintUsages
  });
  const deleteMethodOptions = DELETE_METHOD_OPTIONS.filter((option) =>
    availableDeleteMethods.includes(option.id)
  );

  const [deleteMethod, setDeleteMethod] = useState<DeleteMethod | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (hasPublishedPrintUsages) {
      setDeleteMethod("deny-lease");
    }
  }, [hasPublishedPrintUsages]);

  const handleContinue = () => {
    if (deleteMethod) {
      setIsConfirming(true);
    }
  };

  const deleteUsages = async () => {
    if (!image) {
      return;
    }
    try {
      if (hasPublishedPrintUsages) {
        // Only delete deletable usages and leave published print usages
        // @TODO: Delete usages one by one
      } else {
        await image.perform("delete-usages");
      }
    } catch (error) {
      throw new Error(
        `Failed to delete usages: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  const deleteCrops = async () => {
    if (!image) {
      return;
    }
    try {
      const cropsResource = await image.follow<CropsResource>("crops").get();
      await cropsResource.perform("delete-crops");
    } catch (error) {
      throw new Error(
        `Failed to delete crops: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  const hardDeleteImage = async () => {
    if (!image) {
      return;
    }
    const targetImage = await waitForImageWithAction(image, "hard-delete");
    await targetImage.perform("hard-delete");
  };

  const softDeleteImage = async () => {
    if (!image) {
      return;
    }
    // Refetch image to ensure image has the latest actions (e.g. following crops and usages deletions)
    const targetImage = await waitForImageWithAction(image, "delete");
    await targetImage.perform("delete");
  };

  const denyLease = async () => {
    if (!image) {
      return;
    }
    await image.perform("add-lease", {
      body: {
        access: "deny-use",
        notes: "Image takedown",
        mediaId: image.data.id,
        createdAt: new Date().toISOString()
      }
    });
  };

  const performDeleteImage = async () => {
    if (deleteMethod === "hard-delete") {
      await hardDeleteImage();
      await onDelete("hard-deleted");
    } else if (deleteMethod === "soft-delete") {
      await softDeleteImage();
      await onDelete("soft-deleted");
    } else if (deleteMethod === "deny-lease") {
      await denyLease();
      await onDelete("denied-lease");
    }
  };

  const handleConfirm = async () => {
    if (!image) {
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      if (crops && crops.length > 0) {
        await deleteCrops();
      }
      if (usages && usages.length > 0) {
        await deleteUsages();
      }
      await performDeleteImage();
      // Only refetch once the delete method itself has succeeded - if it
      // fails, leave crops/usages state as-is so a retry doesn't skip
      // re-attempting deleteCrops/deleteUsages for anything that wasn't
      // actually removed.
      await Promise.all([fetchCrops(), fetchUsages()]);
    } catch (error) {
      setSubmitError(
        `Failed to perform ${deleteMethod} on image. Reason: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setIsConfirming(false);
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setIsConfirming(false);
    setSubmitError(null);
  };

  const loading =
    (usagesLoading || cropsLoading) && (usages === null || crops === null);

  if (loading) {
    return (
      <Typography
        element="p"
        variant="bodySm"
        theme={standThemeOverride.typography.disabled}
      >
        Checking for crops and usages in Grid...
      </Typography>
    );
  }

  return (
    <ClassNames>
      {({ css: classNameCss }) => {
        return (
          <>
            {deleteFromGridStatus !== null && (
              <Typography
                element="p"
                variant="bodySm"
                theme={standThemeOverride.typography.default}
              >
                {getDeleteFromGridStatusText(deleteFromGridStatus)}
              </Typography>
            )}

            <CropsAndUsages
              crops={crops || []}
              publishedPrintUsages={publishedPrintUsages.toArray()}
              deletableUsages={deletableUsages.toArray()}
              deleteFromGridStatus={deleteFromGridStatus}
            />

            {deleteMethodOptions.length > 0 && (
              <div
                className={classNameCss`
                display: flex;
                flex-direction: column;
                align-items: flex-start;
                gap: ${semanticSpacing.stackXs};
                margin-top: ${semanticSpacing.stackMd};
              `}
              >
                <Select
                  size="sm"
                  label="Choose delete method"
                  placeholder="Select a method..."
                  value={deleteMethod}
                  isDisabled={isStepLocked}
                  onChange={(key) => {
                    setDeleteMethod(key as DeleteMethod);
                    setIsConfirming(false);
                  }}
                  theme={standThemeOverride.select}
                  formInputContainerTheme={
                    standThemeOverride.formInputContainer
                  }
                >
                  {deleteMethodOptions.map((option) => (
                    <Option
                      key={option.id}
                      id={option.id}
                      theme={standThemeOverride.select}
                      textValue={option.label}
                      className={classNameCss`font-size:1.25rem`}
                    >
                      {option.label}
                    </Option>
                  ))}
                </Select>

                {!isConfirming ? (
                  <Button
                    isDisabled={isStepLocked || !deleteMethod}
                    onPress={handleContinue}
                  >
                    Continue
                  </Button>
                ) : (
                  <>
                    <div
                      className={classNameCss`
                      display: flex;
                      align-items: center;
                      gap: ${semanticSpacing.stackXs};
                    `}
                    >
                      <Button
                        theme={standThemeOverride.button.destructive}
                        isDisabled={
                          isStepLocked || !deleteMethod || isSubmitting
                        }
                        isPending={isSubmitting}
                        onPress={handleConfirm}
                      >
                        {isSubmitting
                          ? "Loading..."
                          : `Confirm ${
                              DELETE_METHOD_OPTIONS.find(
                                (option) => option.id === deleteMethod
                              )?.label
                            }`}
                      </Button>
                      <Button
                        variant="tertiary"
                        theme={standThemeOverride.button.tertiary}
                        isPending={isSubmitting}
                        isDisabled={isSubmitting}
                        onPress={handleCancel}
                      >
                        Cancel
                      </Button>
                    </div>
                    {submitError && (
                      <Typography
                        element="span"
                        variant="bodySm"
                        theme={standThemeOverride.typography.error}
                      >
                        {submitError}
                      </Typography>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        );
      }}
    </ClassNames>
  );
};
