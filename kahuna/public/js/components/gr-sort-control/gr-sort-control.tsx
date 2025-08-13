import * as React from "react";
import * as angular from "angular";
import { react2angular } from "react2angular";
import { BaseSortControl, SortDropdownOption, SortDropdownProps } from "./base-sort-control";

export type { SortDropdownOption };
export type { SortDropdownProps };
export interface SortWrapperProps {
  props: SortDropdownProps;
}

const SortControl: React.FC<SortWrapperProps> = ({ props }) => {
  const sortProps = { ...props,
    simpleDisplay: true
  };

  return (
    <BaseSortControl {...sortProps} />
  );
};

export const sortControl = angular.module('gr.sortControl', [])
  .component('sortControl', react2angular(SortControl, ["props"]));
