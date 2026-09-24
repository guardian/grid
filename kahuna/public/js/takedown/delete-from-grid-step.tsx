import * as React from "react";
import { useState } from "react";
import { ClassNames, css } from "@emotion/react";
import { Typography } from "@guardian/stand/Typography";
import { Button } from "@guardian/stand/Button";
import { Select, Option } from "@guardian/stand/Select";
import { Grid, Item } from "@guardian/stand/Grid";
import { semanticSpacing, semanticColors } from "@guardian/stand";
import { standThemeOverride } from "../util/constants/standThemeOverride";
import { Crop } from "../types/image";
import { useTakedownContext } from "./takedown-context";

type DeleteMethod = "hard-delete" | "soft-delete" | "deny-lease";

const DELETE_METHOD_OPTIONS: { id: DeleteMethod; label: string }[] = [
  { id: "hard-delete", label: "Hard Delete" },
  { id: "soft-delete", label: "Soft Delete" },
  { id: "deny-lease", label: "Deny Lease" }
];

const cropLabel = (crop: Crop) => {
  const { aspectRatio } = crop.specification;
  const dimensions = crop.master?.dimensions;
  const details = [
    aspectRatio ?? "Freeform",
    dimensions && `${dimensions.width} x ${dimensions.height}`
  ].filter(Boolean);

  return details.length > 0 ? details.join(", ") : "Crop";
};

const getUsageStatusLabel = (status: string) => {
  if (status === "removed") {
    return "Taken down";
  }

  if (status === "unknown") {
    return "Fronts";
  }

  return status.charAt(0).toUpperCase() + status.slice(1);
};

export const DeleteFromGridStep: React.FC = () => {
  const { usages, usagesLoading, crops, cropsLoading, getStepStatus } =
    useTakedownContext();
  const stepStatus = getStepStatus("delete-from-grid");

  const [deleteMethod, setDeleteMethod] = useState<DeleteMethod | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const contentUsages = usages
    ? usages.filter((usage) => usage.status !== "downloaded")
    : [];
  const downloadUsages = usages
    ? usages.filter((usage) => usage.status === "downloaded")
    : [];

  const handleContinue = () => {
    if (deleteMethod) {
      setIsConfirming(true);
    }
  };

  const handleConfirm = () => {
    // @TODO:
    // 1) Delete crops
    // 2) Delete usages
    // 3) Perform soft delete / hard delete / deny lease
  };

  const handleCancel = () => {
    setIsConfirming(false);
  };

  const loading =
    (usagesLoading || cropsLoading) && (usages === null || crops === null);
  const loaded = usages !== null && crops !== null;
  const isEmpty = loaded && usages.length === 0 && crops.length === 0;

  return (
    <ClassNames>
      {({ css: classNameCss }) => {
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

        if (isEmpty) {
          return (
            <Typography
              element="p"
              variant="bodySm"
              theme={standThemeOverride.typography.default}
            >
              This image has no crops or usages remaining in Grid.
            </Typography>
          );
        }

        const listStyles = classNameCss`
          padding: 0 0 0 ${semanticSpacing.stackMd};
          border-left: 1px dotted ${semanticColors.border.strong};
          display: flex;
          flex-direction: column;
          gap: ${semanticSpacing.stackXxs};
        `;

        return (
          <>
            <Typography
              element="p"
              variant="bodySm"
              theme={standThemeOverride.typography.default}
            >
              Performing this action will delete following crops and usages from
              Grid:
            </Typography>
            <Grid
              theme={{
                sm: { padding: "0px", gap: semanticSpacing.stackXs },
                md: { padding: "0px", gap: semanticSpacing.stackXs },
                lg: { padding: "0px", gap: semanticSpacing.stackXs }
              }}
            >
              {crops !== null && (
                <Item size={{ sm: 12, md: 6, lg: 6 }}>
                  <div
                    className={classNameCss`
                    display: flex;
                    flex-direction: column;
                    gap: ${semanticSpacing.stackSm};
                  `}
                  >
                    <Typography
                      element="span"
                      variant="bodyItalicSm"
                      theme={standThemeOverride.typography.default}
                    >
                      Crops
                    </Typography>
                    {crops.length === 0 ? (
                      <Typography
                        element="span"
                        variant="bodySm"
                        theme={standThemeOverride.typography.secondary}
                      >
                        None
                      </Typography>
                    ) : (
                      <ul className={listStyles}>
                        {crops.map((crop) => (
                          <li
                            key={crop.id}
                            className={classNameCss`
                              display: flex;
                            `}
                          >
                            <Typography
                              element="span"
                              variant="bodyBoldSm"
                              theme={standThemeOverride.typography.secondary}
                            >
                              {cropLabel(crop)}
                            </Typography>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </Item>
              )}

              {usages !== null && usages.length > 0 && (
                <Item size={{ sm: 12, md: 6, lg: 6 }}>
                  <div
                    className={classNameCss`
                      display: flex;
                      flex-direction: column;
                      gap: ${semanticSpacing.stackSm};
                    `}
                  >
                    <Typography
                      element="span"
                      variant="bodyItalicSm"
                      theme={standThemeOverride.typography.default}
                    >
                      Usages
                    </Typography>
                    {usages.length === 0 ? (
                      <Typography
                        element="span"
                        variant="bodyBoldSm"
                        theme={standThemeOverride.typography.secondary}
                      >
                        None
                      </Typography>
                    ) : (
                      <ul className={listStyles}>
                        {contentUsages.map((usage) => {
                          const articleTitle = usage.references.find(
                            (reference) =>
                              reference.type === "frontend" ||
                              reference.type === "front" ||
                              reference.type === "indesign"
                          )?.name;

                          return (
                            <li
                              key={usage.id}
                              className={classNameCss`
                                      display: flex;
                                    `}
                            >
                              {articleTitle && (
                                <Typography
                                  element="span"
                                  variant="bodyBoldSm"
                                  theme={
                                    standThemeOverride.typography.secondary
                                  }
                                >
                                  {articleTitle}
                                  <Typography
                                    element="span"
                                    variant="bodyItalicSm"
                                    theme={
                                      standThemeOverride.typography.secondary
                                    }
                                    cssOverrides={css`
                                      margin-left: ${semanticSpacing.stackXs};
                                    `}
                                  >
                                    [{getUsageStatusLabel(usage.status)}]
                                  </Typography>
                                </Typography>
                              )}
                            </li>
                          );
                        })}
                        {downloadUsages.length > 0 && (
                          <li
                            className={classNameCss`
                              display: flex;
                            `}
                          >
                            <Typography
                              element="span"
                              variant="bodySm"
                              theme={standThemeOverride.typography.secondary}
                            >
                              {downloadUsages.length} download
                              {downloadUsages.length === 1 ? "" : "s"}
                            </Typography>
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                </Item>
              )}
            </Grid>

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
                isDisabled={stepStatus !== "current"}
                onChange={(key) => {
                  setDeleteMethod(key as DeleteMethod);
                  setIsConfirming(false);
                }}
                theme={standThemeOverride.select}
                formInputContainerTheme={standThemeOverride.formInputContainer}
              >
                {DELETE_METHOD_OPTIONS.map((option) => (
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
                  isDisabled={stepStatus !== "current" || !deleteMethod}
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
                      isDisabled={stepStatus !== "current" || !deleteMethod}
                      onPress={handleConfirm}
                    >
                      Confirm{" "}
                      {
                        DELETE_METHOD_OPTIONS.find(
                          (option) => option.id === deleteMethod
                        )?.label
                      }
                    </Button>
                    <Button
                      variant="tertiary"
                      theme={standThemeOverride.button.tertiary}
                      onPress={handleCancel}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              )}
            </div>
          </>
        );
      }}
    </ClassNames>
  );
};
