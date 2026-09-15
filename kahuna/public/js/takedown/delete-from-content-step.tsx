import * as React from "react";
import { ClassNames, css } from "@emotion/react";
import { Typography } from "@guardian/stand/Typography";
import { Link } from "@guardian/stand/Link";
import { semanticSpacing, semanticColors } from "@guardian/stand";
import { standThemeOverride } from "../util/constants/standThemeOverride";
import { Usage } from "../types/image";
import { useTakedownContext } from "./takedown-context";
import frontendIconSvg from "../components/gr-icon/icons/frontend.svg";
import composerIconSvg from "../components/gr-icon/icons/composer.svg";

const findReferenceUri = (usage: Usage, type: string) =>
  usage.references.find((reference) => reference.type === type)?.uri;

const REFERENCE_ICON: Record<string, { svg: string; size: number }> = {
  frontend: { svg: frontendIconSvg, size: 13 },
  composer: { svg: composerIconSvg, size: 12 }
};

const linkWithIconStyles = css`
  display: inline-flex;
  align-items: center;
  gap: ${semanticSpacing.stackXs};
`;

const UsageReferenceIcon: React.FC<{ type: string }> = ({ type }) => {
  const icon = REFERENCE_ICON[type];
  if (!icon) {
    return null;
  }

  return (
    <ClassNames>
      {({ css: classNameCss }) => (
        <span
          aria-hidden="true"
          className={classNameCss`
            display: inline-flex;
            flex-shrink: 0;
            width: ${icon.size}px;
            height: ${icon.size}px;

            svg {
              width: 100%;
              height: 100%;
            }

            svg path {
              fill: currentColor;
            }
          `}
          dangerouslySetInnerHTML={{ __html: icon.svg }}
        />
      )}
    </ClassNames>
  );
};

export const DeleteFromContentStep: React.FC = () => {
  const { activeContent, activeContentLoading: loading } = useTakedownContext();

  return (
    <ClassNames>
      {({ css: classNameCss }) => {
        if (loading && !activeContent) {
          return (
            <Typography
              element="p"
              variant="bodySm"
              theme={standThemeOverride.typography.disabled}
            >
              Checking for pending or published content...
            </Typography>
          );
        }

        return (
          <>
            {activeContent !== null && activeContent.length === 0 && (
              <Typography
                element="p"
                variant="bodySm"
                theme={standThemeOverride.typography.default}
              >
                This image is not currently used in any pending or published
                content.
              </Typography>
            )}

            {activeContent !== null && activeContent.length > 0 && (
              <>
                <Typography
                  element="p"
                  variant="bodySm"
                  theme={standThemeOverride.typography.default}
                >
                  This image is currently used in the following content. Remove
                  it from each one through Composer before continuing.
                </Typography>

                <ul
                  className={classNameCss`
                    padding: 0 0 0 ${semanticSpacing.stackMd};
                    margin: ${semanticSpacing.stackMd} 0;
                    border-left: 1px dotted ${semanticColors.border.strong};
                  `}
                >
                  {activeContent.map((usage) => {
                    const guardianUri = findReferenceUri(usage, "frontend");
                    const composerUri = findReferenceUri(usage, "composer");
                    const articleTitle = usage.references.find(
                      (reference) => reference.type === "frontend"
                    )?.name;

                    return (
                      <li
                        key={usage.id}
                        className={classNameCss`
                          margin-bottom: ${semanticSpacing.stackMd};
                        `}
                      >
                        <div
                          className={classNameCss`
                            display: flex;
                            flex-direction: column;
                            gap: ${semanticSpacing.stackXxs};
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
                                [
                                {usage.status === "published"
                                  ? "Published"
                                  : "Pending"}
                                ]
                              </Typography>
                            </Typography>
                          )}
                          <div
                            className={classNameCss`
                              display: flex;
                              gap: ${semanticSpacing.stackMd};
                            `}
                          >
                            {guardianUri && (
                              <Link
                                href={guardianUri}
                                target="_blank"
                                theme={standThemeOverride.link}
                                cssOverrides={linkWithIconStyles}
                              >
                                <UsageReferenceIcon type="frontend" />
                                Guardian
                              </Link>
                            )}
                            {composerUri && (
                              <Link
                                href={composerUri}
                                target="_blank"
                                theme={standThemeOverride.link}
                                cssOverrides={linkWithIconStyles}
                              >
                                <UsageReferenceIcon type="composer" />
                                Composer
                              </Link>
                            )}
                          </div>
                        </div>
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
