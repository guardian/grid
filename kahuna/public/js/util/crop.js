import angular from 'angular';

import { landscape, portrait, video, square, freeform, cropOptions } from './constants/cropOptions';

const CROP_TYPE_STORAGE_KEY = 'cropType';
const CUSTOM_CROP_STORAGE_KEY = 'customCrop';

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

  const setCustomCrop = customRatio => {
    const parsedRatio = parseRatio(customRatio);
    if (parsedRatio) {
      storage.setJs(CUSTOM_CROP_STORAGE_KEY, customCrop(parsedRatio.label, parsedRatio.x, parsedRatio.y), true);
    } else {
      storage.clearJs(CUSTOM_CROP_STORAGE_KEY);
    }
  };

  function set({cropType, customRatio}) {
    // set customRatio first in case cropType relies on a custom crop
    if (customRatio) {
      setCustomCrop(customRatio);
    }

    if (cropType) {
      setCropType(cropType);
    }

  }

  function getCropType() {
    const cropType = storage.getJs(CROP_TYPE_STORAGE_KEY, true);

    if (isValidCropType(cropType)) {
      return cropType;
    }
  }

  return { set, getCropType, getCropOptions };
}]);

cropUtil.filter('asCropType', function() {
  return ratioString => {
    const cropSpec = cropOptions.find(_ => _.ratioString === ratioString) || freeform;
    return cropSpec.key;
  };
});
