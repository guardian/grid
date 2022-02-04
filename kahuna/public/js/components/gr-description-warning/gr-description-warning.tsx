import * as React from "react";
import * as angular from "angular";
import { react2angular } from "react2angular";

import styles from "./gr-description-warning.module.css";

const MIN_LENGTH = 30;
const MIN_WORDS = 5;

const shouldShowWarning = (value: string): boolean => {
  const wordCount = value.split(' ').length;
  return value.length < MIN_LENGTH || wordCount < MIN_WORDS;
};

interface GrDescriptionWarningProps {
  description: string | undefined;
}
const GrDescriptionWarning: React.FC<GrDescriptionWarningProps> = ({ description }) => {
  const showWarning = description ? shouldShowWarning(description) : true;

  return showWarning && (
    <div className={`flex-right text-small ${styles['gr-description-warning']}`}>
      <span className={`${styles.message}`}>
        Your description is too short! Ideally, please state who, what where, when and why.
      </span>
    </div>
  );
};

export const grDescription = angular.module('gr.descriptionWarning', [])
  .component('grDescriptionWarning', react2angular(GrDescriptionWarning, ['description']));
