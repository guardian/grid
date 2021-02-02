import angular from 'angular';
import Cropper from 'cropperjs';
import 'cropperjs/dist/cropper.css';

import './cropper-override.css';

import {cropUtil} from '../../util/crop';

export var cropBox = angular.module('ui.cropBox', [cropUtil.name]);

cropBox.directive('uiCropBox', [
  '$timeout',
  '$parse',
  'safeApply',
  'nextTick',
  'delay',
  'cropSettings',
  function($timeout, $parse, safeApply, nextTick, delay, cropSettings) {

    return {
        restrict: 'A',
        scope: {
            coords:         '=uiCropBox',
            cropType:       '=uiCropBoxCropType',
            originalWidth:  '=uiCropBoxOriginalWidth',
            originalHeight: '=uiCropBoxOriginalHeight'
        },
        link: function (scope, element) {
            var cropper;

            if (typeof scope.coords !== 'object') {
                throw new Error('The uiCropBox directive requires an object as parameter');
            }

            // Note: in Chrome there's a bug whereby the image
            // dimensions aren't properly set when install() is called
            // immediately, apparently if the image is already in the
            // browser cache (?).
            // TODO: check if already loaded, in which case call install immediately
            // FIXME: the delay here is because the image is first draw with it's full width
            // and then redrawn to 100%. On occasion this redraw doesn't happen beofre we install
            // thus stretching the image.
            element.on('load', () => delay(100).then(install));

            var previewImg;
            var widthRatio;
            var heightRatio;

            function install() {

                const image = element[0];
                const options = {
                    viewMode: 1,
                    movable: false,
                    scalable: false,
                    zoomable: false,
                    background: false,
                    responsive: false,
                    autoCropArea: 1,
                    crop: update,
                    ready: getRatio
                };

                cropper = new Cropper(image, options);

                postInit(cropper);

            }

            function destroy() {
                if (cropper) {
                    cropper.destroy();
                    cropper = null;
                }
            }

            function getRatio() {
                previewImg = cropper.getCanvasData();
                widthRatio = scope.originalWidth / previewImg.naturalWidth;
                heightRatio = scope.originalHeight / previewImg.naturalHeight;
            }

            function update(c) {
                // Can be triggered from within a $digest cycle
                // (e.g. redraw after aspect changed) or not (user
                // interaction)
                $timeout(() => {
                    scope.coords.x1 = (c.detail.x * widthRatio);
                    scope.coords.y1 = (c.detail.y * heightRatio);
                    scope.coords.x2 = ((c.detail.width + c.detail.x) * widthRatio);
                    scope.coords.y2 = ((c.detail.height + c.detail.y) * heightRatio);
                },0);
            }

            // Once initialised, sync all options to cropperjs
            function postInit(cropper) {
                scope.$watch('cropType', function(cropType) {
                    const allCropOptions = cropSettings.getCropOptions();
                    const cropSpec = allCropOptions.find(_ => _.key === cropType);
                    cropper.setAspectRatio(cropSpec.ratio);
                });

                scope.$on('user-width-change', function(event, width){
                    let newWidth = (parseInt(width) / widthRatio);
                    cropper.setData({ width: newWidth });
                });
                scope.$on('user-height-change', function(event, height){
                    let newHeight = (parseInt(height) / heightRatio);
                    cropper.setData({ height: newHeight });
                });
                scope.$on('user-x-change', function(event, inX){
                    let newX = (parseInt(inX) / heightRatio);
                    cropper.setData({ x: newX });
                });
                scope.$on('user-y-change', function(event, inY){
                    let newY = (parseInt(inY) / heightRatio);
                    cropper.setData({ y: newY });
                });

                scope.$on('$destroy', destroy);
            }
        }
    };
}]);
