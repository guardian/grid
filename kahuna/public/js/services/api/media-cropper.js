import angular from 'angular';
import apiServices from 'services/api';

apiServices.factory('mediaCropper',
                    ['mediaApi',
                     function(mediaApi) {

    var cropperRoot;

    function getCropperRoot() {
        if (! cropperRoot) {
            cropperRoot = mediaApi.root.follow('cropper');
        }
        return cropperRoot;
    }

    function createCrop(image, coords, ratio) {
        return getCropperRoot().follow('crop').post({
            source: image.uri, // FIXME: <- promise...
            x: coords.x,
            y: coords.y,
            width: coords.width,
            height: coords.height,
            aspectRatio: ratio
        });
    }

    function getCropsFor(image) {
        // FIXME: need to avoid getReponse so we get a hyper resource
        return image.follow('crops').getData().then(function(x) {
            console.log(x)
            return x
        });
        // return $http.get(getLinkHref(image.links, 'crops'), { withCredentials: true }).then(function(response) {
        //     return response.data.data;
        // });
    }

    return {
        createCrop: createCrop,
        getCropsFor: getCropsFor
    };
}]);
