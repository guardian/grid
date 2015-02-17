import jQuery from 'jquery';
import 'jcrop';

import controlsDirectives from '../directives';


controlsDirectives.directive('uiCropBox', ['$document', '$timeout', '$parse', 'safeApply', 'nextTick', 'delay',
                                           function($document, $timeout, $parse, safeApply, nextTick, delay) {

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
                } catch(e) {
                    throw new Error('Non float value '+value+' where float expected');
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
            fullsizeImage:  '=uiFullsizeImage'
        },
        link: function (scope, element) {
            var jcropInstance;
            var $el = jQuery(element[0]);

            if (typeof scope.coords !== 'object') {
                throw new Error('The uiCropBox directive requires an object as parameter');
            }

            // Note: in Chrome there's a bug whereby the image
            // dimensions aren't properly set when install() is called
            // immediately, apparently if the image is already in the
            // browser cache (?).
            // TODO: check if already loaded, in which case call install immediately
            // FIXME: the delay here is because the image is first draw with it's full width
            // and then redrawn to 100%. On occasion this redraw doesn't happen before we install
            // thus stretching the image.
            element.on('load', () => delay(100).then(install));

            function install() {
                var initialCoords = [
                    scope.coords.x1, // x
                    scope.coords.y1, // y
                    scope.coords.x2, // x2
                    scope.coords.y2  // y2
                ];

                var trueSize;
                if (scope.originalWidth && scope.originalHeight) {
                    trueSize = [scope.originalWidth, scope.originalHeight];
                }

                // this resizes the thumbnail to the original
                if (scope.originalHeight > scope.originalWidth) {
                    $el.attr('height', scope.originalHeight);
                } else {
                    $el.attr('width', scope.originalWidth);
                }

                $el.Jcrop({
                    onChange: update,
                    onSelect: update,
                    setSelect: initialCoords,
                    trueSize: trueSize
                }, function() {
                    jcropInstance = this;

                    // Note: must yield first
                    $timeout(postInit, 0);
                });

                // FIXME: massive hack as jCrop doesn't expose anything to be
                // able to do access anything really
                $document.find('.jcrop-holder img')[0].src = scope.fullsizeImage;
            }

            function destroy() {
                if (jcropInstance) {
                    jcropInstance.destroy();
                    jcropInstance = null;
                }
            }

            function update(c) {
                // Can be triggered from within a $digest cycle
                // (e.g. redraw after aspect changed) or not (user
                // interaction)
                safeApply(scope, function() {
                    scope.coords.x1 = parseInt(c.x, 10);
                    scope.coords.y1 = parseInt(c.y, 10);
                    scope.coords.x2 = parseInt(c.x2, 10);
                    scope.coords.y2 = parseInt(c.y2, 10);
                });
            }


            // Once initialised, sync all options to Jcrop
            function postInit() {
                scope.$watch('aspectRatio', asFloat(function(aspectRatio) {
                    jcropInstance.setOptions({aspectRatio: aspectRatio});
                }));

                scope.$watch('minSize', asInt(function(minSize) {
                    jcropInstance.setOptions({minSize: minSize});
                }));

                scope.$watch('maxSize', asInt(function(maxSize) {
                    jcropInstance.setOptions({maxSize: maxSize});
                }));

                scope.$watch('bgColor', function(bgColor) {
                    jcropInstance.setOptions({bgColor: bgColor});
                });

                scope.$watch('bgOpacity', asFloat(function(bgOpacity) {
                    jcropInstance.setOptions({bgOpacity: bgOpacity});
                }));

                scope.$on('$destroy', destroy);
            }
        }
    };
}]);
