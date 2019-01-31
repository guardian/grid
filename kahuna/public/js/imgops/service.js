import angular from 'angular';

export var imgops = angular.module('kahuna.imgops', []);

imgops.factory('imgops', ['$window', function($window) {
    const quality = 85;

    const lowResMaxWidth  = 800;
    const lowResMaxHeight = 800;
    const isFF = !!$window.navigator.userAgent.match(/firefox/i);

    function getFullScreenUri(image) {
        let { width: w, height: h } = $window.screen;
        if (isFF) {
            const zoom = $window.devicePixelRatio;
            if (zoom !== 1) {
                h = Math.round(h * zoom);
                w = Math.round(w * zoom);
            }
        }

        return getOptimisedUri(image, { w, h, q: quality });
    }

    function getLowResUri(image) {
        return getOptimisedUri(image, {
            w: lowResMaxWidth,
            h: lowResMaxHeight,
            q: quality
        });
    }

    function getOptimisedUri(image, options) {

        if (image.data.optimisedPng) {
            return image.follow('optimisedPng', options).getUri().catch(() => {
                return image.optimisedPng.secureUrl || image.optimisedPng.file;
            });
        } else {
            return image.follow('optimised', options).getUri().catch(() => {
                return image.source.secureUrl || image.source.file;
            });
        }
    }

    return {
        getFullScreenUri,
        getLowResUri
    };

}]);
