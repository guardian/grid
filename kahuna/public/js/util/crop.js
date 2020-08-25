import angular from 'angular';

const STORAGE_KEY = 'cropType';

// `ratioString` is sent to the server, being `undefined` for `freeform` is expected 🙈
const landscape = {key: 'landscape', ratio: 5 / 3, ratioString: '5:3'};
const portrait = {key: 'portrait', ratio: 4 / 5, ratioString: '4:5'};
const video = {key: 'video', ratio: 16 / 9, ratioString: '16:9'};
const square = {key: 'square', ratio: 1, ratioString: '1:1'};
const freeform = {key: 'freeform', ratio: null};
const editionsCoverCard = {key: 'cover card', ratio: 10 / 17, ratioString: '10:17'};
const editionsCoverCard2 = {key: 'cover card (current)', ratio: 20 / 31, ratioString: '20:31'};

const cropOptions = [landscape, portrait, video, square, freeform, editionsCoverCard2];

export const cropUtil = angular.module('util.crop', ['util.storage']);

cropUtil.constant('landscape', landscape);
cropUtil.constant('portrait', portrait);
cropUtil.constant('video', video);
cropUtil.constant('square', square);
cropUtil.constant('freeform', freeform);
cropUtil.constant('editionsCoverCard', editionsCoverCard);
cropUtil.constant('editionsCoverCard2', editionsCoverCard2);
cropUtil.constant('cropOptions', cropOptions);
cropUtil.constant('defaultCrop', landscape);

cropUtil.factory('cropTypeUtil', ['storage', function(storage) {
  const isValidCropType = cropType => cropOptions.some(_ => _.key === cropType);

  function set({cropType}) {
    if (!cropType) {
      return;
    }

    if (isValidCropType(cropType)) {
      storage.setJs(STORAGE_KEY, cropType, true);
    } else {
      storage.clearJs(STORAGE_KEY);
    }
  }

  function get() {
    const cropType = storage.getJs(STORAGE_KEY, true);

    if (isValidCropType(cropType)) {
      return cropType;
    }
  }

  return { set, get };
}]);

cropUtil.filter('asCropType', function() {
  return ratioString => {
    const cropSpec = cropOptions.find(_ => _.ratioString === ratioString) || freeform;
    return cropSpec.key;
  };
});
