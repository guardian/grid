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
            type: 'crop',
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
        // TODO: this should be an Action
        return image.getLink('crops').
            then(() => true, () => false);
    }

    function canDeleteCrops(image) {
        // return a function that performs the action
        const actionName = 'delete-crops';
        return image.follow('crops').get().then(crops =>
            crops.getAction(actionName).then(action => {
                if (action) {
                    return () => crops.perform(actionName);
                }
            }));
    }

    function getCropsFor(image) {
        return image.follow('crops').getData();
    }

    return {
        createCrop,
        canBeCropped,
        getCropsFor,
        canDeleteCrops
    };
}]);
