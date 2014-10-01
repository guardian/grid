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

    function getLink(link) {
        return getCropperRoot().then(function(response) {
            return response.data.links.filter(l => l.rel === link)[0];
        });
    }

    function createCrop(image, coords, ratio) {
        return getLink('crop').then(function(cropsLink) {
            return $http.post(cropsLink.href, {
                source: image.uri,
                x: coords.x,
                y: coords.y,
                width: coords.width,
                height: coords.height,
                aspectRatio: ratio
            }, { withCredentials: true }).then(function(response) {
                return response.data;
            });
        });
    }

    function getCropsFor(imageKey) {
        return getLink('crop').then(function(cropsLink) {
            return $http.get(cropsLink.href + '/' + imageKey, { withCredentials: true }).then(function(response) {
                return response.data.data;
            });
        });
    }

    return {
        createCrop: createCrop,
        getCropsFor: getCropsFor
    };
}]);
