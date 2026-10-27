import angular from 'angular';

export var imgops = angular.module('kahuna.imgops', []);

imgops.factory('imgops', ['$window', '$q', function($window, $q) {
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

    // Signed imgproxy URLs can't be templated, so the API signs one per width x height box (smallest first);
    // use the smallest that covers the requested size, or the largest available.
    function pickSignedUri(signedUrls, { w, h }) {
        const covering = signedUrls.find(signed => signed.w >= w && signed.h >= h);
        return (covering || signedUrls[signedUrls.length - 1]).url;
    }

    function getOptimisedUri(image, options) {
        const signedUrls = image.data.signedOptimisedUrls;
        if (signedUrls && signedUrls.length > 0) {
            return $q.resolve(pickSignedUri(signedUrls, options));
        }

        const rel = image.data.optimisedPng ? 'optimisedPng' : 'optimised';

        return image.follow(rel, options).getUri().catch(() => {
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
