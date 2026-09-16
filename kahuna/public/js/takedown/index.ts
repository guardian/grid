import * as angular from "angular";

import { takedownController } from "./controller";
import { GridImage } from "../types/image";
import "../components/gr-top-bar/gr-top-bar";

import takedownTemplate from "./view.html";

export const takedown = angular.module("kahuna.takedown", [
  takedownController.name,
  "gr.topBar"
]);

interface MediaApi {
  find: (
    imageId: string
  ) => Promise<GridImage & { getAction: (name: string) => Promise<unknown> }>;
}

// Grid image ids are a SHA-1 hex digest of the file contents (see
// image-loader's BodyParsers.scala), so they're always exactly 40 hex
// characters. Reject anything else (e.g. "1234") before ever hitting the API.
const IMAGE_ID_PATTERN = /^[0-9a-f]{40}$/i;

// ui-router (angular-ui-router 0.4.x) has no published type definitions in this
// project, so the injected services below are typed loosely (any) rather than
// left as implicit-any.
takedown.config([
  "$stateProvider",
  (stateProvider: any) => {
    stateProvider.state("takedown", {
      url: "/images/:imageId/takedown",
      template: takedownTemplate,
      controller: "TakedownCtrl",
      controllerAs: "ctrl",
      resolve: {
        imageId: [
          "$stateParams",
          "$state",
          "$q",
          (stateParams: any, state: any, q: any) => {
            const imageId = stateParams.imageId;
            if (!IMAGE_ID_PATTERN.test(imageId)) {
              // state.go must be deferred to a later tick: angular-ui-router
              // assigns $state.transition = ... for *this* transition right
              // after resolving all states, which happens synchronously,
              // straight after this resolve function returns. If we call
              // state.go synchronously here, that assignment would
              // immediately clobber it, so the redirect never "wins" and
              // silently does nothing instead of showing the error page.
              q.when().then(() => {
                state.go("image-error", { message: "Invalid image ID" });
              });
              return q.reject("invalid-image-id");
            }
            return imageId;
          }
        ],
        image: [
          "$q",
          "mediaApi",
          "imageId",
          (q: any, mediaApi: MediaApi, imageId: string) => {
            return mediaApi.find(imageId).catch((error: any) => {
              if (error && error.status === 404) {
                // The image does not exit in Grid - likely because it's
                // already been taken down previously. Resolve to null rather
                // than erroring out, so the page can still render.
                return null;
              }
              return q.reject(error);
            });
          }
        ],
        // Gate access to this page behind the `delete_crops_or_usages` permission.
        // The `delete-usages` action is only present on the image resource
        // (returned by media-api) when the current user's permissions allow it,
        // so its presence/absence is what actually reflects the user's access.
        // @TODO: We may want to switch this to 'takedown' action when that is available in the API.
        ensureCanTakedown: [
          "$state",
          "$q",
          "image",
          (
            state: any,
            q: any,
            image: { getAction: (name: string) => Promise<unknown> } | null
          ) => {
            if (!window._clientConfig.imageTakedownEnabled) {
              state.go("image-error", { message: "Page not found" });
              return q.reject("feature-disabled");
            }
            // A null image means it's already been deleted from Grid - there's
            // nothing left to gate access to, so let the user through to see
            // the (already complete) takedown steps.
            if (!image) {
              return;
            }
            return image.getAction("delete-usages").then((action: unknown) => {
              if (!action) {
                state.go("image-error", {
                  message: "You do not have permission to take down this image"
                });
                return q.reject("403");
              }
            });
          }
        ]
      }
    });
  }
]);
