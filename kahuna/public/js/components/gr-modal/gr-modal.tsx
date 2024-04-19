import * as React from "react";
import * as angular from "angular";
import { react2angular } from "react2angular";

export interface ModalProps {
  placeholder: string;
}

export interface ModalWrapperProps {
  props: ModalProps;
}

const Modal: React.FC<ModalWrapperProps> = ({ props }) => {

  return (
    <div> Hello Modal </div>
  );
}

export const modal = angular.module('gr.modal', [])
  .component('modal', react2angular(Modal, ["props"]));
