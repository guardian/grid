import angular from 'angular';

import '../components/gr-keyboard-shortcut/gr-keyboard-shortcut';
import {radioList} from '../components/gr-radio-list/gr-radio-list';

const crop = angular.module('kahuna.crop.controller', ['gr.keyboardShortcut', radioList.name]);

crop.controller('ImageCropCtrl', [
  '$scope',
  '$rootScope',
  '$stateParams',
  '$state',
  '$filter',
  '$document',
  'mediaApi',
  'mediaCropper',
  'image',
  'optimisedImageUri',
  'keyboardShortcut',
  'storage', function(
    $scope,
    $rootScope,
    $stateParams,
    $state,
    $filter,
    $document,
    mediaApi,
    mediaCropper,
    image,
    optimisedImageUri,
    keyboardShortcut,
    storage) {

      const ctrl = this;
      const imageId = $stateParams.imageId;

      if ($stateParams.cropType) {
        storage.setJs('cropType', $stateParams.cropType, true);
      }

      ctrl.cropOptions = [
        {key: 'landscape', ratio: 5 /3,    value: 'Landscape (5:3)', tooltip: 'Landscape [l]', disabled: false},
        {key: 'portrait',  ratio: 4 / 5,   value: 'Portrait (4:5)',  tooltip: 'Portrait [p]'},
        {key: 'video',     ratio: 16 / 9,  value: 'Video (16:9)',    tooltip: 'Video [v]'},
        {key: 'square',    ratio: 1,       value: 'Square (1:1)',    tooltip: 'Square [s]'},
        {key: 'freeform',  ratio: null,    value: 'Freeform',        tooltip: 'Freeform [f]', disabled: true}
      ];

      ctrl.cropType = storage.getJs('cropType', true);

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
        })
        .add({
          combo: 'l',
          description: 'Start landscape crop',
          callback: () => {
            ctrl.cropType = 'landscape';
          }
        })
        .add({
          combo: 's',
          description: 'Start square crop',
          callback: () => {
            ctrl.cropType = 'square';
          }
        })
        .add({
          combo: 'p',
          description: 'Start portrait crop',
          callback: () => {
            ctrl.cropType = 'portrait';
          }
        })
        .add({
          combo: 'v',
          description: 'Start video crop',
          callback: () => {
            ctrl.cropType = 'video';
          }
        })
        .add({
          combo: 'f',
          description: 'Start free-form crop',
          callback: () => {
            ctrl.cropType = 'freeform';
          }
        });

      ctrl.image = image;
      ctrl.optimisedImageUri = optimisedImageUri;

      ctrl.cropping = false;

      const originalDimensions = image.data.source.dimensions;
      ctrl.originalWidth  = originalDimensions.width;
      ctrl.originalHeight = originalDimensions.height;

      ctrl.maxInputX = () => ctrl.originalWidth - ctrl.cropWidth();

      ctrl.maxInputY = () => ctrl.originalHeight - ctrl.cropHeight();

      ctrl.coords = {
        x1: ctrl.inputX,
        y1: ctrl.inputY,
        // fill the image with the selection
        x2: ctrl.originalWidth,
        y2: ctrl.originalHeight
      };

      $scope.$watch('ctrl.cropType', (newAspect) => {
        const cropSpec = ctrl.cropOptions.find(_ => _.key === newAspect);

        if (cropSpec) {
          ctrl.aspect = cropSpec.ratio;

          if (cropSpec.key === 'freeform') {
            ctrl.coords = {
              x1: ctrl.inputX,
              y1: ctrl.inputY,
              // fill the image with the selection
              x2: ctrl.originalWidth,
              y2: ctrl.originalHeight
            };
          }
        } else {
          ctrl.cropType = 'landscape';
        }
      });

      // If we have a square crop, remove any jitter introduced by client lib by using only one side
      if (ctrl.cropType === 'square') {
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

      ctrl.broadcastHeightChange = () => $scope.$broadcast('user-height-change', ctrl.inputHeight);
      ctrl.broadcastWidthChange = () => $scope.$broadcast('user-width-change', ctrl.inputWidth);
      ctrl.broadcastXChange = () => $scope.$broadcast('user-x-change', ctrl.inputX);
      ctrl.broadcastYChange = () => $scope.$broadcast('user-y-change', ctrl.inputY);

      //make the view match the ctrl value
      $scope.$watch(() => ctrl.cropWidth(), () => ctrl.inputWidth = ctrl.cropWidth());
      $scope.$watch(() => ctrl.cropHeight(), () => ctrl.inputHeight = ctrl.cropHeight());
      $scope.$watch(() => ctrl.cropX(), () => ctrl.inputX = ctrl.cropX());
      $scope.$watch(() => ctrl.cropY(), () => ctrl.inputY = ctrl.cropY());

      ctrl.cropSizeWarning = () => ctrl.cropWidth() < 500;

      function crop() {
        // TODO: show crop
        var coords = {
          x: Math.round(ctrl.coords.x1),
          y: Math.round(ctrl.coords.y1),
          width:  ctrl.cropWidth(),
          height: ctrl.cropHeight()
        };

        var ratio = ctrl.getRatioString(ctrl.aspect);

        ctrl.cropping = true;

        mediaCropper.createCrop(ctrl.image, coords, ratio).then(crop => {
          // Global notification of action
          $rootScope.$emit('events:crop-created', {
            image: ctrl.image,
            crop: crop
          });

          $state.go('image', {
            imageId: imageId,
            crop: crop.data.id
          });
        }).finally(() => {
          ctrl.cropping = false;
        });
      }

      ctrl.callCrop = function() {
        //prevents return keypress on the crop button posting crop twice
        if (!ctrl.cropping) {
          crop();
        }
      };
    }]);

