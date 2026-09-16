import * as angular from "angular";

import { takedownPage } from "./takedown-page";
import { GridImage } from "../types/image";

const takedownController = angular.module("kahuna.takedown.controller", [
  takedownPage.name
]);

takedownController.controller("TakedownCtrl", [
  "image",
  "imageId",
  function (image: GridImage | null, imageId: string) {
    const ctrl = this as { image: GridImage | null; imageId: string };

    ctrl.image = image;
    ctrl.imageId = imageId;
  }
]);

export { takedownController };
