import angular from 'angular';
import Cropper from 'cropperjs';

export var cropBox = angular.module('ui.cropBox', []);

cropBox.directive('uiCropBox', ['$timeout', '$parse', 'safeApply', 'nextTick', 'delay',
                                function($timeout, $parse, safeApply, nextTick, delay) {

    return {
        restrict: 'A',
        scope: {
            coords:         '=uiCropBox',
            aspectRatio:    '=uiCropBoxAspect',
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
                    built: getRatio
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
                safeApply(scope, function() {
                    scope.coords.x1 = (c.detail.x * widthRatio);
                    scope.coords.y1 = (c.detail.y * heightRatio);
                    scope.coords.x2 = ((c.detail.width + c.detail.x) * widthRatio);
                    scope.coords.y2 = ((c.detail.height + c.detail.y) * heightRatio);
                });
            }


            // Once initialised, sync all options to cropperjs
            function postInit(cropper) {
                scope.$watch('aspectRatio', function(aspectRatio) {
                    cropper.setAspectRatio(aspectRatio);
                });

                scope.$on('user-width-change', function(event, width){
                    let newWidth = (parseInt(width) / widthRatio);
                    cropper.setData({ width: newWidth });

                });
                scope.$on('user-height-change', function(event, height){
                    let newHeight = (parseInt(height) / heightRatio);
                    cropper.setData({ height: newHeight });

                });

                scope.$on('$destroy', destroy);
            }
        }
    };
}]);
