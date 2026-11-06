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

    function getLowResDownloadUri(image) {
        return getOptimisedDownloadUri(image, {
            width: lowResMaxWidth,
            height: lowResMaxHeight,
            quality: quality
        });
    }

    function getOptimisedUri(image, options) {
        const rel = image.data.optimisedPng ? 'optimisedPng' : 'optimised';

        // Signed imgproxy URLs can't be templated, so media-api signs one for exactly this size,
        // leaving quality to imgproxy's default
        const uri = image.data.optimisedUrlsRequireResolution ?
            image.follow(rel, { w: options.w, h: options.h }).get().then(resolved => resolved.data.url) :
            image.follow(rel, options).getUri();

        return uri.catch(() => {
            const asset = image.data.optimisedPng ? image.optimisedPng : image.source;
            return asset.secureUrl || asset.file;
        });
    }

    function getOptimisedDownloadUri(image, options) {
        return image.follow('downloadOptimised', options).getUri().catch(() => {
            return image.follow('download');
        });
    }

    return {
        getFullScreenUri,
        getLowResUri,
        getLowResDownloadUri
    };

}]);
