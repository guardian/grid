import angular from 'angular';
import jQuery from 'jquery';
//import 'jcrop';
import Cropper from 'fengyuanchen/cropperjs';

export var cropBox = angular.module('ui.cropBox', []);

cropBox.directive('uiCropBox', ['$timeout', '$parse', 'safeApply', 'nextTick', 'delay',
                                function($timeout, $parse, safeApply, nextTick, delay) {

    // Annoyingly, AngularJS passes us values as strings,
    // so we need to convert them, which can potentially
    // fail.
    function to(mapper) {
        return function(func) {
            return function(value) {
                try {
                    var mappedValue;
                    // don't try to convert undefined
                    if (typeof value !== 'undefined') {
                        mappedValue = mapper(value);
                    }
                    func(mappedValue);
                } catch (e) {
                    throw new Error(`Non float value ${value} where float expected`);
                }
            };
        };
    }

    var asFloat = to(parseFloat);
    var asInt = to(function(s){ return parseInt(s, 10); });


    return {
        restrict: 'A',
        scope: {
            coords:         '=uiCropBox',
            aspectRatio:    '=uiCropBoxAspect',
            originalWidth:  '=uiCropBoxOriginalWidth',
            originalHeight: '=uiCropBoxOriginalHeight',
            minSize:        '=uiCropBoxMinSize',
            maxSize:        '=uiCropBoxMaxSize',
            bgColor:        '=uiCropBoxBackgroundColor',
            bgOpacity:      '=uiCropBoxBackgroundOpacity',
        },
        link: function (scope, element) {

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

            let previewImg;
            let widthRatio;
            let heightRatio;

            function install() {

                const image = element[0];
                const options = {
                    viewMode: 1,
                    movable: false,
                    scalable: false,
                    zoomable: false,
                    background: false,
                    crop: update,
                };

                const cropper = new Cropper(image, options);

                postInit(cropper);
                image.addEventListener('built', function () {
                    previewImg = cropper.getCanvasData();
                    widthRatio = scope.originalWidth / previewImg.naturalWidth;
                    heightRatio = scope.originalHeight / previewImg.naturalHeight;
                });

            }

            function destroy() {
                if (cropper) {
                    cropper.destroy();
                }
            }

            function update(c) {
                console.log(c.detail);
                console.log('update w', widthRatio, 'update h', heightRatio);

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


            // Once initialised, sync all options to cropprjs
            function postInit(cropper) {
                scope.$watch('aspectRatio', function(aspectRatio) {
                    console.log("aspect changing!!!!!", aspectRatio, cropper);
                    cropper.setAspectRatio(aspectRatio);
                });

                scope.$on('user-size-change', function(event, width, height){
                    console.log("user changed size: change!", width, cropper)
                    //const x2 = scope.coords.x1 + parseInt(width);
                    cropper.cropBoxData.width = (parseInt(width) / widthRatio);
                    cropper.cropBoxData.height = (parseInt(height) / heightRatio);
                    //cropper.getCropBoxData();
                    cropper.renderCropBox();
                });
                scope.$on('$destroy', destroy);
            }
        }
    };
}]);
