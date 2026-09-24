import * as angular from "angular";

import { takedownController } from "./controller";
import { type GridImage } from "../types/image";
import { type Action } from "../types/api";
import "../components/gr-top-bar/gr-top-bar";

import takedownTemplate from "./view.html";

export const takedown = angular.module("kahuna.takedown", [
  takedownController.name,
  "gr.topBar"
]);

interface MediaApi {
  find: (imageId: string) => Promise<GridImage>;
  root: { getLink: (rel: string) => Promise<unknown> };
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
        ensureCanTakedown: [
          "$state",
          "$q",
          "image",
          "mediaApi",
          (state: any, q: any, image: GridImage | null, mediaApi: MediaApi) => {
            const deny = () => {
              state.go("image-error", {
                message: "You do not have permission to take down this image"
              });
              return q.reject("403");
            };

            return mediaApi.root
              .getLink("capiUsages")
              .then(
                () => true,
                () => false
              )
              .then((takedownFeatureEnabled: boolean) => {
                if (!takedownFeatureEnabled) {
                  return deny();
                }

                // A null image means it's already been deleted from Grid -
                // there's nothing left to gate access to, so let the user
                // through to see the (already complete) takedown steps.
                if (!image) {
                  return;
                }

                // Note: `delete`/`hard-delete` are deliberately NOT checked
                // here - media-api only exposes those actions once the image
                // has no usages/exports left (see Image.canBeDeleted).
                return q
                  .all([
                    image.getAction("delete-usages"),
                    image.getAction("add-lease")
                  ])
                  .then(([deleteUsagesAction, addLeaseAction]: Action[]) => {
                    if (!deleteUsagesAction || !addLeaseAction) {
                      return deny();
                    }
                  });
              });
          }
        ]
      }
    });
  }
]);
