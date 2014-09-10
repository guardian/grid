import angular from 'angular';
import controlsDirectives from 'directives';
import jQuery from 'jquery';
// import jcrop from 'github:tapmodo/Jcrop';
// import jcrop from 'jcrop';
import 'github:tapmodo/Jcrop@0.9.12/js/jquery.Jcrop';
import 'github:tapmodo/Jcrop@0.9.12/css/jquery.Jcrop.css!';

// TODO: move this to a shared place!
// Helper to $apply the fn on the scope iff we're not
// already in a $digest cycle.  Necessary because of
// the different contexts we can be called from.
controlsDirectives.value('safeApply', function (scope, fn) {
    if (scope.$$phase || scope.$root.$$phase) {
        fn();
    } else {
        scope.$apply(function () {
            fn();
        });
    }
});

controlsDirectives.directive('uiCropBox', ['$timeout', '$parse', 'safeApply',
                                           function($timeout, $parse, safeApply) {

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
            coords:      '=uiCropBox',
            aspectRatio: '=uiCropBoxAspect',
            originalWidth:  '=uiCropBoxOriginalWidth',
            originalHeight: '=uiCropBoxOriginalHeight',
            minSize:     '=uiCropBoxMinSize',
            maxSize:     '=uiCropBoxMaxSize',
            bgColor:     '=uiCropBoxBackgroundColor',
            bgOpacity:   '=uiCropBoxBackgroundOpacity'
        },
        link: function (scope, element, attrs, ctrl) {
            var jcropInstance;
            var $el = jQuery(element[0]);

            if (typeof scope.coords !== 'object') {
                throw new Error('The uiCropBox directive requires an object as parameter');
            }

            // TODO: check if already loaded, in which case call install immediately
            element.on('load', install);

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
