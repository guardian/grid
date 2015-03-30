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
        return getCropperRoot().follow('crop').post({
            source: image.uri,
            x: coords.x,
            y: coords.y,
            width: coords.width,
            height: coords.height,
            aspectRatio: ratio
        });
    }

    function canBeCropped(image) {
        // Images can only be cropped if there is a link to the crops
        return image.getLink('crops').
            then(() => true, () => false);
    }

    function getCropsFor(image) {
        return image.follow('crops').getData();
    }

    return {
        createCrop,
        canBeCropped,
        getCropsFor
    };
}]);
