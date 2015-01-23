import apiServices from '../api';

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
        return image.uri.then(uri => {
            return getCropperRoot().follow('crop').post({
                source: uri,
                x: coords.x,
                y: coords.y,
                width: coords.width,
                height: coords.height,
                aspectRatio: ratio
            });
        });
    }

    function getCropsFor(image) {
        return image.follow('crops').getResponse();
    }

    return {
        createCrop: createCrop,
        getCropsFor: getCropsFor
    };
}]);
