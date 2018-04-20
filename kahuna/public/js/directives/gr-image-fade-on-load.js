import angular from 'angular';

export var imageFade = angular.module('gr.imageFadeOnLoad', []);

imageFade.directive('grImageFadeOnLoad',
                    ['$q', '$timeout',
                     function ($q, $timeout) {

    // TODO: customise duration, transition
    const animationThreshold = 50; // ms
    const animationDuration = 200; // ms

    return {
        restrict: 'A',
        link: function (scope, element) {
            // If not loaded after animationThreshold, hide and wait
            // until loaded to fade in
            $timeout(() => {
                if (! isLoaded()) {
                    hide();
                    whenLoaded().finally(reveal);
                }
            }, animationThreshold);


            function isLoaded() {
                return element[0].complete;
            }

            function whenLoaded() {
                const defer = $q.defer();

                // already loaded
                if (isLoaded()) {
                    defer.resolve();
                } else {
                    // wait until loaded/error
                    element.on('load', defer.resolve);
                    element.on('error', defer.reject);

                    // free listeners once observed
                    defer.promise.finally(() => {
                        element.off('load', defer.resolve);
                        element.off('error', defer.reject);
                    });
                }

                return defer.promise;
            }

            function hide() {
                element.css({
                    opacity: 0
                });
                element.parent().addClass('loading');
            }

            function reveal() {
                element.css({
                    opacity: 1,
                    transition: `opacity ${animationDuration}ms ease-out`
                });
                element.parent().removeClass('loading');
            }

        }
    };
}]);
