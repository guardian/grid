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
                    element.bind('load', defer.resolve);
                    element.bind('error', defer.reject);

                    // free listeners once observed
                    defer.promise.finally(() => {
                        element.unbind('load', defer.resolve);
                        element.unbind('error', defer.reject);
                    });
                }

                return defer.promise;
            }

            function hide() {
                element.css({
                    opacity: 0
                });
            }

            function reveal() {
                element.css({
                    opacity: 1,
                    transition: `opacity ${animationDuration}ms ease-out`
                });
            }

        }
    };
}]);
