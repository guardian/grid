import angular from 'angular';
import apiServices from 'services/api';

apiServices.factory('mediaCropper',
                    ['$http', 'mediaApi',
                     function($http, mediaApi) {

    var cropperRoot;

    function getCropperRoot() {
        if (! cropperRoot) {
            cropperRoot = mediaApi.getRoot().then(function(response) {
                var resource = response.data;
                var cropperLink = resource.links.filter(l => l.rel === 'cropper')[0];
                return $http.get(cropperLink.href);
            });
        }
        return cropperRoot;
    }

    function getLinkRoot(link) {
        return getCropperRoot().then(function(response) {
            return response.data.links.filter(l => l.rel === link)[0];
        });
    }

    function getLinkHref(links, rel) {
        return links.find(link => link.rel === rel).href;
    }

    function createCrop(image, coords, ratio) {
        return getLinkRoot('crop').then(function(cropsLink) {
            return $http.post(cropsLink.href, {
                source: image.uri,
                x: coords.x,
                y: coords.y,
                width: coords.width,
                height: coords.height,
                aspectRatio: ratio
            }, { withCredentials: true });
        });
    }

    function getCropsFor(image) {
        return $http.get(getLinkHref(image.links, 'crops'), { withCredentials: true }).then(function(response) {
            return response.data.data;
        });
    }

    return {
        createCrop: createCrop,
        getCropsFor: getCropsFor
    };
}]);
