import angular from 'angular';

export var imgops = angular.module('kahuna.imgops', []);

imgops.factory('imgops', ['$window', function($window) {
    const quality = 85;

    const lowResMaxWidth  = 800;
    const lowResMaxHeight = 800;


    function getFullScreenUri(image) {
        const { width: w, height: h } = $window.screen;
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
        return image.follow('optimised', options).getUri().catch(() => {
            return image.source.secureUrl || image.source.file;
        });
    }

    return {
        getFullScreenUri,
        getLowResUri
    };

}]);
