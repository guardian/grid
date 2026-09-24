import * as React from "react";
import { List } from "immutable";
import { ClassNames, css } from "@emotion/react";
import { Typography } from "@guardian/stand/Typography";
import { Grid, Item } from "@guardian/stand/Grid";
import { semanticSpacing, semanticColors } from "@guardian/stand";
import { standThemeOverride } from "../util/constants/standThemeOverride";
import { Crop, Usage } from "../types/image";
import { type DeleteFromGridStatus } from "./takedown-context";

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

export const CropsAndUsages = ({
  crops,
  publishedPrintUsages,
  deletableUsages,
  deleteFromGridStatus
}: {
  crops: Crop[];
  publishedPrintUsages: Usage[];
  deletableUsages: Usage[];
  deleteFromGridStatus: DeleteFromGridStatus | null;
}) => {
  // eslint-disable-next-line new-cap
  const [contentUsages, downloadUsages] = List<Usage>(
    deletableUsages
  ).partition((usage) => usage.status === "downloaded");
  const hasDeletableCropsOrUsages =
    crops.length > 0 || deletableUsages.length > 0;

  return (
    <ClassNames>
      {({ css: classNameCss }) => {
        const listStyles = classNameCss`
          padding: 0 0 0 ${semanticSpacing.stackMd};
          border-left: 1px dotted ${semanticColors.border.strong};
          display: flex;
          flex-direction: column;
          gap: ${semanticSpacing.stackXxs};
        `;

        return (
          <>
            {deleteFromGridStatus !== "hard-deleted" &&
              deleteFromGridStatus !== "soft-deleted" &&
              hasDeletableCropsOrUsages && (
                <>
                  <Typography
                    element="p"
                    variant="bodySm"
                    theme={standThemeOverride.typography.default}
                  >
                    Performing this action will delete following crops and
                    usages from Grid:
                  </Typography>
                  <Grid
                    theme={{
                      sm: { padding: "0px", gap: semanticSpacing.stackXs },
                      md: { padding: "0px", gap: semanticSpacing.stackXs },
                      lg: { padding: "0px", gap: semanticSpacing.stackXs }
                    }}
                  >
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
                                  theme={
                                    standThemeOverride.typography.secondary
                                  }
                                >
                                  {cropLabel(crop)}
                                </Typography>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </Item>

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
                        {deletableUsages.length === 0 ? (
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
                                          standThemeOverride.typography
                                            .secondary
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
                            {downloadUsages.size > 0 && (
                              <li
                                className={classNameCss`
                              display: flex;
                            `}
                              >
                                <Typography
                                  element="span"
                                  variant="bodySm"
                                  theme={
                                    standThemeOverride.typography.secondary
                                  }
                                >
                                  {downloadUsages.size} download
                                  {downloadUsages.size === 1 ? "" : "s"}
                                </Typography>
                              </li>
                            )}
                          </ul>
                        )}
                      </div>
                    </Item>
                  </Grid>
                </>
              )}
            {publishedPrintUsages.length > 0 && (
              <>
                <Typography
                  element="p"
                  variant="bodySm"
                  theme={standThemeOverride.typography.default}
                >
                  Below published print usages will remain in Grid:
                </Typography>
                <ul className={listStyles}>
                  {publishedPrintUsages.map((usage) => {
                    const articleTitle = usage.references.find(
                      (reference) => reference.type === "indesign"
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
                            theme={standThemeOverride.typography.secondary}
                          >
                            {articleTitle}
                            <Typography
                              element="span"
                              variant="bodyItalicSm"
                              theme={standThemeOverride.typography.secondary}
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
                </ul>
              </>
            )}
          </>
        );
      }}
    </ClassNames>
  );
};
