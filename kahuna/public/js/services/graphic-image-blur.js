import angular from "angular";
import 'angular-cookies';

const COOKIE_SHOULD_BLUR_GRAPHIC_IMAGES = 'SHOULD_BLUR_GRAPHIC_IMAGES';
const cookieOptions = {domain: `.${window.location.host}`, path: '/'};

export const graphicImageBlurService = angular.module("kahuna.services.graphicImageBlur", ['ngCookies']).factory(
  "graphicImageBlurService",
  ['$cookies', function($cookies) {
    const shouldBlurGraphicImagesCookieValue = $cookies.get(COOKIE_SHOULD_BLUR_GRAPHIC_IMAGES);
    const isYetToAcknowledgeBlurGraphicImages = !shouldBlurGraphicImagesCookieValue; // i.e. cookie not set, one way or the other
    const shouldBlurGraphicImages = (shouldBlurGraphicImagesCookieValue || "true") === "true"; // defaults to true
    return {
      shouldBlurGraphicImages,
      isYetToAcknowledgeBlurGraphicImages,
      toggleShouldBlurGraphicImages: () => {
        const newCookieValue = (!shouldBlurGraphicImages).toString();
        $cookies.put(COOKIE_SHOULD_BLUR_GRAPHIC_IMAGES, newCookieValue, cookieOptions);
        window.location.reload();
      },
      isPotentiallyGraphic: (image) => shouldBlurGraphicImages && (
        image.data.isPotentiallyGraphic || // server can flag images as potentially graphic by inspecting deep in the metadata at query time (not available to the client)
        !![
          'graphic content',
          'depicts death',
          'dead child',
          'child casualty',
          'sensitive material',
          'dead body',
          'dead bodies',
          'body of',
          'bodies of',
          'smout' // this is short for sensitive material out, often used in specialInstructions
        ].find( searchPhrase =>
          image.data?.metadata?.description?.toLowerCase()?.includes(searchPhrase) ||
          image.data?.metadata?.title?.toLowerCase()?.includes(searchPhrase) ||
          image.data?.metadata?.specialInstructions?.toLowerCase()?.includes(searchPhrase) ||
          image.data?.metadata?.keywords?.find(keyword => keyword?.toLowerCase()?.includes(searchPhrase))
        ))
    };
  }]
);
