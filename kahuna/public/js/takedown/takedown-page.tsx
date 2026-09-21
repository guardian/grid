import * as React from "react";
import * as angular from "angular";
import { css } from "@emotion/react";
import { react2angular } from "react2angular";
import { semanticSpacing } from "@guardian/stand";
import { Layout } from "@guardian/stand/Layout";
import { Button } from "@guardian/stand/Button";
import { Typography } from "@guardian/stand/Typography";
import { TakedownStep } from "./takedown-step";
import { DeleteFromContentStep } from "./delete-from-content-step";
import {
  TakedownContextProvider,
  TakedownStepId,
  useTakedownContext
} from "./takedown-context";
import { GridImage, MediaApiRoot } from "../types/image";
import {
  standThemeOverride,
  standRootFontSizeCompensation
} from "../util/constants/standThemeOverride";

type Step = {
  id: TakedownStepId;
  title: string;
  Component: React.FC;
};

const STEPS: Step[] = [
  {
    id: "delete-from-content",
    title: "Delete from content",
    Component: DeleteFromContentStep
  },
  {
    id: "delete-from-grid",
    title: "Delete from Grid",
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
  }
];

export type TakedownPageProps = {
  image: GridImage | null;
  imageId: string;
  mediaApiRoot: MediaApiRoot;
};

const TakedownSteps: React.FC = () => {
  const { getStepStatus } = useTakedownContext();

  return (
    <>
      {STEPS.map((step, index) => (
        <TakedownStep
          key={index}
          title={step.title}
          stepNumber={index + 1}
          status={getStepStatus(step.id)}
          isLastStep={index === STEPS.length - 1}
        >
          <step.Component />
        </TakedownStep>
      ))}
    </>
  );
};

export const TakedownPage: React.FC<TakedownPageProps> = ({
  image,
  imageId,
  mediaApiRoot
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

          <TakedownContextProvider
            image={image}
            mediaApiRoot={mediaApiRoot}
            stepIds={STEPS.map((step) => step.id)}
          >
            <TakedownSteps />
          </TakedownContextProvider>
        </Layout.Main>
      </Layout>
    </div>
  );
};

export const takedownPage = angular
  .module("gr.takedownPage", [])
  .component(
    "grTakedownPage",
    react2angular(TakedownPage, ["image", "imageId", "mediaApiRoot"])
  );
