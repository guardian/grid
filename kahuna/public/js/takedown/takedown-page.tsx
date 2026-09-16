import * as React from "react";
import * as angular from "angular";
import { css } from "@emotion/react";
import { react2angular } from "react2angular";
import { semanticSpacing } from "@guardian/stand";
import { Layout } from "@guardian/stand/Layout";
import { Button } from "@guardian/stand/Button";
import { Typography } from "@guardian/stand/Typography";
import { TakedownStep, TakedownStepStatus } from "./takedown-step";
import { GridImage } from "../types/image";
import {
  standThemeOverride,
  standRootFontSizeCompensation
} from "../util/constants/standThemeOverride";

type StepId = "delete-from-content" | "delete-from-grid" | "purge-cache";

type Step = {
  id: StepId;
  title: string;
  getStatus: () => TakedownStepStatus;
  Component: React.FC<{ image: GridImage | null }>;
};

const STEPS: Step[] = [
  {
    id: "delete-from-content",
    title: "Delete from content",
    getStatus: () => "complete",
    Component: () => (
      // @TODO: Delete from content step
      <>
        <Typography
          element="p"
          variant="bodySm"
          theme={standThemeOverride.typography.default}
        >
          This image is currently used in the following content. Remove it from
          each one before continuing.
        </Typography>
        <Button>Delete from Content</Button>
      </>
    )
  },
  {
    id: "delete-from-grid",
    title: "Delete from Grid",
    getStatus: () => "current",
    Component: () => (
      // @TODO: Delete from Grid step
      <>
        <Typography
          element="p"
          variant="bodySm"
          theme={standThemeOverride.typography.default}
        >
          This image is currently used in the following crops and usages. Remove
          it from each one in Grid before continuing.
        </Typography>
        <Button>Delete from Grid</Button>
      </>
    )
  },
  {
    id: "purge-cache",
    title: "Purge Fastly cache",
    getStatus: () => "locked",
    Component: () => (
      // @TODO: Purge cache step
      <>
        <Typography
          element="p"
          variant="bodySm"
          theme={standThemeOverride.typography.default}
        >
          After deleting the image from content and Grid, purge the cache from
          Fastly to ensure it is no longer served.
        </Typography>
        <Button>Purge cache</Button>
      </>
    )
  }
];

export type TakedownPageProps = {
  image: GridImage | null;
  imageId: string;
};

export const TakedownPage: React.FC<TakedownPageProps> = ({
  image,
  imageId
}) => {
  return (
    <div
      style={{ zoom: standRootFontSizeCompensation }}
      className="image-takedown"
    >
      <Layout>
        <Layout.Main
          fluid={false}
          cssOverrides={css`
            padding: 0 ${semanticSpacing.stackMd};
          `}
        >
          <Typography
            element="h1"
            variant="headingXl"
            theme={standThemeOverride.typography.default}
            cssOverrides={css`
              margin-bottom: ${semanticSpacing.stackMd};
            `}
          >
            Takedown image
          </Typography>
          <Typography
            element="p"
            variant="bodyItalicSm"
            theme={standThemeOverride.typography.secondary}
            cssOverrides={css`
              margin-bottom: ${semanticSpacing.stackLg};
            `}
          >
            ID: {imageId}
          </Typography>

          {STEPS.map((step, index) => (
            <TakedownStep
              key={index}
              title={step.title}
              stepNumber={index + 1}
              status={step.getStatus()}
              isLastStep={index === STEPS.length - 1}
            >
              <step.Component image={image} />
            </TakedownStep>
          ))}
        </Layout.Main>
      </Layout>
    </div>
  );
};

export const takedownPage = angular
  .module("gr.takedownPage", [])
  .component(
    "grTakedownPage",
    react2angular(TakedownPage, ["image", "imageId"])
  );
