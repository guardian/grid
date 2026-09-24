import * as angular from "angular";

import { takedownPage } from "./takedown-page";
import { GridImage, MediaApiRoot } from "../types/image";

const takedownController = angular.module("kahuna.takedown.controller", [
  takedownPage.name
]);

takedownController.controller("TakedownCtrl", [
  "image",
  "imageId",
  "mediaApi",
  function (
    image: GridImage | null,
    imageId: string,
    mediaApi: { root: MediaApiRoot }
  ) {
    const ctrl = this as {
      image: GridImage | null;
      imageId: string;
      mediaApiRoot: MediaApiRoot;
    };

    ctrl.image = image;
    ctrl.imageId = imageId;
    ctrl.mediaApiRoot = mediaApi.root;
  }
]);

export { takedownController };
