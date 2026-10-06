import * as React from "react";
import { ClassNames } from "@emotion/react";
import { Typography } from "@guardian/stand/Typography";
import {
  semanticColors,
  semanticSpacing,
  semanticSizing
} from "@guardian/stand";
import { standThemeOverride } from "../util/constants/standThemeOverride";

const COMPLETE_COLOR = semanticColors.fill.successWeak;
const CURRENT_COLOR = semanticColors.fill.selectedPressedWeaker;
const LOCKED_COLOR = semanticColors.fill.disabled;

export type TakedownStepStatus = "complete" | "current" | "locked";

export type TakedownStepProps = {
  title: string;
  stepNumber: number;
  isLastStep: boolean;
  status: TakedownStepStatus;
  children: React.ReactNode;
};

export const TakedownStep: React.FC<TakedownStepProps> = ({
  title,
  stepNumber,
  isLastStep,
  status,
  children
}) => {
  const stepColor =
    status === "complete"
      ? COMPLETE_COLOR
      : status === "current"
        ? CURRENT_COLOR
        : LOCKED_COLOR;

  return (
    <ClassNames>
      {({ css }) => (
        <div
          className={css`
            display: flex;
            align-items: stretch;
          `}
        >
          <div
            className={css`
              display: flex;
              flex-direction: column;
              align-items: center;
              margin-right: ${semanticSpacing.stackMd};
            `}
          >
            <div
              className={css`
                width: ${semanticSizing.height.md};
                height: ${semanticSizing.height.md};
                flex-shrink: 0;
                border-radius: 50%;
                background-color: ${stepColor};
                display: flex;
                align-items: center;
                justify-content: center;
              `}
            >
              <Typography element="span" variant="bodyBoldMd">
                {status === "complete" ? "\u2713" : stepNumber}
              </Typography>
            </div>
            {!isLastStep && (
              <div
                className={css`
                  width: 2px;
                  flex-grow: 1;
                  background-color: ${stepColor};
                `}
              />
            )}
          </div>
          <div
            className={css`
              flex: 1;
              padding-top: ${semanticSpacing.stackXs};
              padding-bottom: ${semanticSpacing.stackLg};
              opacity: ${status === "locked" ? 0.6 : 1};
            `}
          >
            <Typography
              element="h2"
              variant="headingLg"
              theme={standThemeOverride.typography.default}
            >
              {title}
            </Typography>
            {children}
          </div>
        </div>
      )}
    </ClassNames>
  );
};
