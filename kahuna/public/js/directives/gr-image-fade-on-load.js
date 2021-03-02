import angular from 'angular';

export var imageFade = angular.module('gr.imageFadeOnLoad', []);

imageFade.directive('grImageFadeOnLoad',
                    ['$q', '$timeout',
                     function ($q, $timeout) {

    // TODO: customise duration, transition
                         const animationDuration = 200; // ms
                         const revealAfter = 1500; // ms

    return {
        restrict: 'A',
        link: function (scope, element) {
            // If not loaded, hide and wait
            // until loaded to fade in
                if (! isLoaded()) {
                    hide();
                    whenLoaded();
                }

            // If not loaded after revealAfter
            // show the image, it's progressive so we should
            // have something to show for our time
            $timeout(() => {
                reveal();
            }, revealAfter);

            function isLoaded() {
                return element[0].complete;
            }

            function whenLoaded() {
                const defer = $q.defer();
                const revealAndResolve = () => {
                    reveal();
                    defer.resolve();
                };
                const revealAndReject = () => {
                    reveal();
                    defer.reject();
                };
                // already loaded
                if (isLoaded()) {
                    revealAndResolve();
                } else {
                    // wait until loaded/error
                    element.on('load', revealAndResolve);
                    element.on('error', revealAndReject);

                    // free listeners once observed
                    defer.promise.finally(() => {
                        element.off('load', revealAndResolve);
                        element.off('error', revealAndReject);
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
