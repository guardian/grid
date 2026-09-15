import * as React from "react";
import { ClassNames, css } from "@emotion/react";
import { Typography } from "@guardian/stand/Typography";
import { Button } from "@guardian/stand/Button";
import { Grid, Item } from "@guardian/stand/Grid";
import { semanticSpacing, semanticColors } from "@guardian/stand";
import { standThemeOverride } from "../util/constants/standThemeOverride";
import { Crop } from "../types/image";
import { useTakedownContext } from "./takedown-context";

const cropLabel = (crop: Crop) => {
  const { aspectRatio } = crop.specification;
  const dimensions = crop.master?.dimensions;
  const details = [
    aspectRatio ?? "Freeform",
    dimensions && `${dimensions.width} x ${dimensions.height}`
  ].filter(Boolean);

  return details.length > 0 ? details.join(", ") : "Crop";
};

export const DeleteFromGridStep: React.FC = () => {
  const { usages, usagesLoading, crops, cropsLoading } = useTakedownContext();

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
          margin: ${semanticSpacing.stackMd} 0;
          border-left: 1px dotted ${semanticColors.border.strong};
          display: flex;
          flex-direction: column;
          gap: ${semanticSpacing.stackXs};
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
                  `}
                  >
                    <Typography
                      element="span"
                      variant="bodyItalicSm"
                      theme={standThemeOverride.typography.default}
                    >
                      Crops:
                    </Typography>
                    {crops.length === 0 ? (
                      <Typography
                        element="span"
                        variant="bodySm"
                        theme={standThemeOverride.typography.default}
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
              `}
                  >
                    <Typography
                      element="span"
                      variant="bodyItalicSm"
                      theme={standThemeOverride.typography.default}
                    >
                      Usages:
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
                        {usages.map((usage) => {
                          const articleTitle = usage.references.find(
                            (reference) => reference.type === "frontend"
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
                                    [
                                    {usage.status === "published"
                                      ? "Published"
                                      : usage.status === "removed"
                                        ? "Removed"
                                        : "Pending"}
                                    ]
                                  </Typography>
                                </Typography>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </Item>
              )}
            </Grid>

            <Button
              cssOverrides={css`
                margin-top: ${semanticSpacing.stackSm};
              `}
            >
              Delete from Grid
            </Button>
          </>
        );
      }}
    </ClassNames>
  );
};
