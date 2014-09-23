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

    function createCrop(image, coords, ratio) {
        return getCropperRoot().then(function(response) {
            var cropperResource = response.data;
            var cropLink = cropperResource.links.filter(l => l.rel === 'crop')[0];
            return $http.post(cropLink.href, {
                source: image.uri,
                x: coords.x,
                y: coords.y,
                width: coords.width,
                height: coords.height,
                aspectRatio: ratio
            }, { withCredentials: true });
        });
    }

    return {
        createCrop: createCrop
    };
}]);
