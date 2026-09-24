import * as React from "react";
import { ClassNames, css } from "@emotion/react";
import { Typography } from "@guardian/stand/Typography";
import { Link } from "@guardian/stand/Link";
import { semanticSpacing, semanticColors } from "@guardian/stand";
import { standThemeOverride } from "../util/constants/standThemeOverride";
import { useTakedownContext } from "./takedown-context";
import { GridImage } from "../types/image";
import frontendIconSvg from "../components/gr-icon/icons/frontend.svg";
import composerIconSvg from "../components/gr-icon/icons/composer.svg";

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

export const DeleteFromContentStep: React.FC<{
  image: GridImage | null;
}> = () => {
  const { activeContent, activeContentLoading, usages, usagesLoading } =
    useTakedownContext();

  const frontsUsages = (usages || []).filter(
    (usage) => usage.status === "unknown"
  );
  const pendingPrintUsages = (usages || []).filter(
    (usage) => usage.status === "pending" && usage.platform === "print"
  );

  if ((activeContentLoading || usagesLoading) && !activeContent) {
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
    <ClassNames>
      {({ css: classNameCss }) => {
        const listStyles = classNameCss`
          padding: 0 0 0 ${semanticSpacing.stackMd};
          margin: ${semanticSpacing.stackMd} 0;
          border-left: 1px dotted ${semanticColors.border.strong};
        `;

        return (
          <>
            {activeContent !== null && activeContent.length === 0 && (
              <Typography
                element="p"
                variant="bodySm"
                theme={standThemeOverride.typography.default}
              >
                This image is not currently used in any pending or published web
                articles.
              </Typography>
            )}

            {activeContent !== null && activeContent.length > 0 && (
              <>
                <Typography
                  element="p"
                  variant="bodySm"
                  theme={standThemeOverride.typography.default}
                >
                  This image is currently used in the following web articles.
                  Remove it before continuing.
                </Typography>

                <ul className={listStyles}>
                  {activeContent.map((content) => (
                    <li
                      key={content.contentId}
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
                        <Typography
                          element="span"
                          variant="bodyBoldSm"
                          theme={standThemeOverride.typography.secondary}
                        >
                          {content.webTitle || "No title given"}
                          {content.isLive ? (
                            <Typography
                              element="span"
                              variant="bodyItalicSm"
                              theme={standThemeOverride.typography.secondary}
                              cssOverrides={css`
                                margin-left: ${semanticSpacing.stackXs};
                              `}
                            >
                              [Published]
                            </Typography>
                          ) : null}
                        </Typography>
                        <div
                          className={classNameCss`
                              display: flex;
                              gap: ${semanticSpacing.stackMd};
                            `}
                        >
                          {content.isLive && (
                            <Link
                              href={content.webUrl}
                              target="_blank"
                              theme={standThemeOverride.link}
                              cssOverrides={linkWithIconStyles}
                            >
                              <UsageReferenceIcon type="frontend" />
                              Guardian
                            </Link>
                          )}
                          <Link
                            href={content.composerUrl}
                            target="_blank"
                            theme={standThemeOverride.link}
                            cssOverrides={linkWithIconStyles}
                          >
                            <UsageReferenceIcon type="composer" />
                            Composer
                          </Link>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {frontsUsages.length > 0 && (
              <>
                <Typography
                  element="p"
                  variant="bodySm"
                  theme={standThemeOverride.typography.default}
                >
                  This image has been used in below fronts. Please review and
                  ensure that the image is no longer live in fronts before
                  proceeding.
                </Typography>
                <ul className={listStyles}>
                  {frontsUsages.map((usage) => (
                    <li
                      key={usage.id}
                      className={classNameCss`
                        display: flex;
                        margin-bottom: ${semanticSpacing.stackXxs};
                      `}
                    >
                      <Link
                        href={`${window._clientConfig.contentWebBaseUrl}/${usage.frontUsageMetadata.front}`}
                        target="_blank"
                        theme={standThemeOverride.link}
                        cssOverrides={linkWithIconStyles}
                      >
                        <UsageReferenceIcon type="frontend" />
                        {usage.frontUsageMetadata.front}
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {pendingPrintUsages.length > 0 && (
              <>
                <Typography
                  element="p"
                  variant="bodySm"
                  theme={standThemeOverride.typography.default}
                >
                  This image is used in below pending print articles. Please
                  remove it from InDesign before proceeding.
                </Typography>
                <ul className={listStyles}>
                  {pendingPrintUsages.map((usage) => (
                    <li
                      key={usage.id}
                      className={classNameCss`
                        display: flex;
                        margin-bottom: ${semanticSpacing.stackXxs};
                      `}
                    >
                      <Typography
                        element="span"
                        variant="bodyBoldSm"
                        theme={standThemeOverride.typography.secondary}
                      >
                        {usage.references.find((ref) => ref.type === "indesign")
                          ?.name ?? "No title given"}
                      </Typography>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        );
      }}
    </ClassNames>
  );
};
