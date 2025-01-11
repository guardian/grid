import angular from 'angular';

import '../components/gr-keyboard-shortcut/gr-keyboard-shortcut';
import {radioList} from '../components/gr-radio-list/gr-radio-list';
import {cropUtil} from "../util/crop";
import {cropOptions} from "../util/constants/cropOptions";

const crop = angular.module('kahuna.crop.controller', [
  'gr.keyboardShortcut',
  radioList.name,
  cropUtil.name
]);

crop.controller('ImageCropCtrl', [
  '$scope',
  '$rootScope',
  '$stateParams',
  '$state',
  'mediaApi',
  'mediaCropper',
  'image',
  'optimisedImageUri',
  'keyboardShortcut',
  'defaultCrop',
  'cropSettings',
  'square',
  'freeform',
  'pollUntilCropCreated',
  function(
    $scope,
    $rootScope,
    $stateParams,
    $state,
    mediaApi,
    mediaCropper,
    image,
    optimisedImageUri,
    keyboardShortcut,
    defaultCrop,
    cropSettings,
    square,
    freeform,
    pollUntilCropCreated) {

      const ctrl = this;
      const imageId = $stateParams.imageId;

    cropSettings.set($stateParams);
      const allCropOptions = cropSettings.getCropOptions();

      const storageCropType = cropSettings.getCropType();
      const storageDefaultCropType = cropSettings.getDefaultCropType();

      const cropOptionDisplayValue = cropOption => cropOption.ratioString
        ? `${cropOption.displayName} (${cropOption.ratioString})`
        : cropOption.displayName;

    ctrl.cropOptions = allCropOptions
        .filter(option => (!storageCropType || storageCropType === option.key) && !option.isHidden )
        .map(option => Object.assign(option, {
          value: cropOptionDisplayValue(option),
          minimalValue: option.ratioString || option.key,
          tooltip: `${option.key} [${option.key.charAt(0)}]`,
          disabled: storageCropType && storageCropType !== option.key
        }));

      ctrl.cropType = storageCropType || storageDefaultCropType || defaultCrop.key;

      ctrl.image = image;
      ctrl.optimisedImageUri = optimisedImageUri;

      ctrl.cropping = false;

      const originalDimensions = image.data.source.dimensions;
      const orientedDimensions = image.data.source.orientedDimensions;

      if (orientedDimensions) {
        ctrl.originalWidth = orientedDimensions.width;
        ctrl.originalHeight = orientedDimensions.height;
      } else {
        ctrl.originalWidth = originalDimensions.width;
        ctrl.originalHeight = originalDimensions.height;
      }

      ctrl.maxInputX = () =>
        ctrl.originalWidth - ctrl.cropWidth();

      ctrl.maxInputY = () =>
        ctrl.originalHeight - ctrl.cropHeight();

      ctrl.coords = {
        x1: ctrl.inputX,
        y1: ctrl.inputY,
        // fill the image with the selection
        x2: ctrl.originalWidth,
        y2: ctrl.originalHeight
      };

      // If we have a square crop, remove any jitter introduced by client lib by using only one side
      if (ctrl.cropType === square.key) {
        const sideLength = () => Math.round(ctrl.coords.x2 - ctrl.coords.x1);
        ctrl.cropWidth = sideLength;
        ctrl.cropHeight = sideLength;
      } else {
        ctrl.cropWidth = () => Math.round(ctrl.coords.x2 - ctrl.coords.x1);
        ctrl.cropHeight = () => Math.round(ctrl.coords.y2 - ctrl.coords.y1);
      }


      ctrl.cropX = () => Math.round(ctrl.coords.x1);
      ctrl.cropY = () => Math.round(ctrl.coords.y1);

      ctrl.inputX = parseInt(ctrl.cropX());
      ctrl.inputY = parseInt(ctrl.cropY());

      ctrl.inputWidth = parseInt(ctrl.cropWidth());
      ctrl.inputHeight = parseInt(ctrl.cropHeight());

      ctrl.broadcastHeightChange = function (){
        $scope.$broadcast('user-height-change', ctrl.inputHeight);
      };
      ctrl.broadcastWidthChange = function (){
        $scope.$broadcast('user-width-change', ctrl.inputWidth);
      };
      ctrl.broadcastXChange = function (){
        $scope.$broadcast('user-x-change', ctrl.inputX);
      };
      ctrl.broadcastYChange = function (){
        $scope.$broadcast('user-y-change', ctrl.inputY);
      };

      //make the view match the ctrl value
      $scope.$watch(function(){ return ctrl.cropWidth(); }, function(){
        ctrl.inputWidth = ctrl.cropWidth();
      });
      $scope.$watch(function(){ return ctrl.cropHeight(); }, function(){
        ctrl.inputHeight = ctrl.cropHeight();
      });
      $scope.$watch(function(){ return ctrl.cropX(); }, function(){
        ctrl.inputX = ctrl.cropX();
      });
      $scope.$watch(function(){ return ctrl.cropY(); }, function(){
        ctrl.inputY = ctrl.cropY();
      });

      ctrl.cropSizeWarning = () => ctrl.cropWidth() < 1000;

      function crop() {
        // TODO: show crop
        const coords = {
          x: Math.round(ctrl.coords.x1),
          y: Math.round(ctrl.coords.y1),
          width:  ctrl.cropWidth(),
          height: ctrl.cropHeight()
        };

        const ratioString = ctrl.cropOptions.find(_ => _.key === ctrl.cropType).ratioString;

        ctrl.cropping = true;

        mediaCropper.createCrop(ctrl.image, coords, ratioString)
        .then(crop => {
           // Global notification of action
           $rootScope.$emit('events:crop-created', {
             image: ctrl.image,
             crop: crop
           });
           return crop.data.id;
        })
        .then(cropId => pollUntilCropCreated(ctrl.image, cropId).then(() => {
            $state.go('image', {
                imageId: imageId,
                crop: cropId
            });
        }))
        .finally(() => {
          ctrl.cropping = false;
        });
      }

      ctrl.callCrop = function() {
        //prevents return keypress on the crop button posting crop twice
        if (!ctrl.cropping) {
          crop();
        }
      };

      $scope.$watch('ctrl.cropType', (newCropType, oldCropType) => {
        const isCropTypeDisabled = ctrl.cropOptions.find(_ => _.key === newCropType).disabled;

        const maybeCropRatioIfStandard = cropOptions.find(_ => _.key === ctrl.cropType)?.ratioString;
        ctrl.shouldShowVerticalWarningGutters =
          window._clientConfig.staffPhotographerOrganisation === "GNM"
          && maybeCropRatioIfStandard === "5:3";

        ctrl.shouldShowCircularGuideline =
          window._clientConfig.staffPhotographerOrganisation === "GNM"
          // update this array to apply circular guideline to further ratios (e.g. 5:4)
          && ["square"].includes(ctrl.cropType.toLowerCase());

        ctrl.isSquareCrop = ctrl.cropType.toLowerCase() === "square";

        if (isCropTypeDisabled) {
          ctrl.cropType = oldCropType;
        } else {
          if (newCropType === freeform.key) {
            ctrl.coords = {
              x1: ctrl.inputX,
              y1: ctrl.inputY,
              // fill the image with the selection
              x2: ctrl.originalWidth,
              y2: ctrl.originalHeight
            };
          }
        }
      });

      keyboardShortcut.bindTo($scope)
        .add({
          combo: 'esc',
          description: 'Cancel crop and return to image',
          callback: () => $state.go('image', {imageId: ctrl.image.data.id})
        })
        .add({
          combo: 'enter',
          description: 'Create crop',
          callback: () => ctrl.callCrop()
        });

      cropSettings.getCropOptions().forEach(option => {
        keyboardShortcut.bindTo($scope).add({
          combo: option.key.charAt(0),
          description: `Start ${option.key} crop`,
          callback: () => ctrl.cropType = option.key
        });
      });
    }]);

