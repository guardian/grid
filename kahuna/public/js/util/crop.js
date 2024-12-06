import angular from 'angular';

import {landscape, portrait, video, square, freeform, cropOptions, pointsOfInterestBeta} from './constants/cropOptions';

const CROP_TYPE_STORAGE_KEY = 'cropType';
const CUSTOM_CROP_STORAGE_KEY = 'customCrop';
const SHOULD_SHOW_CROP_GUTTERS_IF_APPLICABLE_STORAGE_KEY = 'shouldShowCropGuttersIfApplicable';
const CROP_DEFAULT_TYPE_STORAGE_KEY = 'defaultCropType';

const customCrop = (label, xRatio, yRatio) => {
  return { key:label, ratio: xRatio / yRatio, ratioString: `${xRatio}:${yRatio}`};
};

export const cropUtil = angular.module('util.crop', ['util.storage']);

cropUtil.constant('landscape', landscape);
cropUtil.constant('portrait', portrait);
cropUtil.constant('video', video);
cropUtil.constant('square', square);
cropUtil.constant('freeform', freeform);
cropUtil.constant('cropOptions', cropOptions);
cropUtil.constant('defaultCrop', cropOptions[0]);

cropUtil.factory('cropSettings', ['storage', function(storage) {
  function getCropOptions() {
    const customCrop =  storage.getJs(CUSTOM_CROP_STORAGE_KEY, true);
    return customCrop ? cropOptions.concat(customCrop) : cropOptions;
  }

  const isValidCropType = cropType => getCropOptions().some(_ => _.key === cropType);

  const isValidRatio = ratio => {
    const [label, x, y] = ratio.split(',');
    return label && !isNaN(x) && !isNaN(y);
  };

  const parseRatio = ratio => {
    // example ratio 'longcrop,1,5'
    if (isValidRatio(ratio)) {
      const [label, x, y] = ratio.split(',');
      return {
        label,
        x: parseInt(x, 10),
        y: parseInt(y, 10)
      };
    }
  };

  const setCropType = (cropType) => {
    if (isValidCropType(cropType)) {
      storage.setJs(CROP_TYPE_STORAGE_KEY, cropType, true);
    } else {
      storage.clearJs(CROP_TYPE_STORAGE_KEY);
    }
  };

  const setDefaultCropType = (defaultCropType) => {
    if (isValidCropType(defaultCropType)) {
      storage.setJs(CROP_DEFAULT_TYPE_STORAGE_KEY, defaultCropType, true);
    } else {
      storage.clearJs(CROP_DEFAULT_TYPE_STORAGE_KEY);
    }
  };

  const setCustomCrop = customRatio => {
    const parsedRatio = parseRatio(customRatio);
    if (parsedRatio) {
      storage.setJs(CUSTOM_CROP_STORAGE_KEY, customCrop(parsedRatio.label, parsedRatio.x, parsedRatio.y), true);
    } else {
      storage.clearJs(CUSTOM_CROP_STORAGE_KEY);
    }
  };

  const setShouldShowCropGuttersIfApplicable = shouldShowCropGuttersIfApplicableStr => {
    storage.setJs(
      SHOULD_SHOW_CROP_GUTTERS_IF_APPLICABLE_STORAGE_KEY,
      shouldShowCropGuttersIfApplicableStr === "true",
      true
    );
  };

  function set({cropType, customRatio, shouldShowCropGuttersIfApplicable, defaultCropType}) {
    // set customRatio first in case cropType relies on a custom crop
    if (customRatio) {
      setCustomCrop(customRatio);
    }

    if (cropType) {
      setCropType(cropType);
    }

    if (defaultCropType) {
      setDefaultCropType(defaultCropType);
    }

    if (shouldShowCropGuttersIfApplicable) {
      setShouldShowCropGuttersIfApplicable(shouldShowCropGuttersIfApplicable);
    }

  }

  function getCropType() {
    const cropType = storage.getJs(CROP_TYPE_STORAGE_KEY, true);

    if (isValidCropType(cropType)) {
      return cropType;
    }
  }

  function getDefaultCropType() {
    const defaultCropType = storage.getJs(CROP_DEFAULT_TYPE_STORAGE_KEY, true);

    if (isValidCropType(defaultCropType)) {
      return defaultCropType;
    }
  }

  function shouldShowCropGuttersIfApplicable() {
    return storage.getJs(SHOULD_SHOW_CROP_GUTTERS_IF_APPLICABLE_STORAGE_KEY, true);
  }

  return { set, getCropType, getCropOptions, shouldShowCropGuttersIfApplicable, getDefaultCropType };
}]);

cropUtil.filter('asCropType', function() {
  return specification => {
    if (specification.type === "poi"){
      return pointsOfInterestBeta.key;
    }
    const cropSpec = cropOptions.find(_ => _.ratioString === specification.aspectRatio) || freeform;
    return cropSpec.key;
  };
});

cropUtil.factory('pollUntilCropCreated', ['$q', 'apiPoll', function($q, apiPoll) {
  return function pollUntilCropCreated(image, newCropId) {
    return apiPoll(() => image.get().then(maybeUpdatedImage => {
      if (maybeUpdatedImage.data.exports.find(crop => crop.id === newCropId) === undefined) {
        return $q.reject();
      }
    }));
  };
}]);
