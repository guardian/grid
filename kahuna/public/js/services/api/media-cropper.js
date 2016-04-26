import angular from 'angular';
import {mediaApi} from './media-api';
import {leaseService} from './leases'


export var cropperApi = angular.module('kahuna.services.api.cropper', [
    mediaApi.name
]);

cropperApi.factory('mediaCropper', ['$q', 'mediaApi', 'leaseService', function($q, mediaApi, leaseService) {

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

    function createFullCrop(image) {
        return getCropperRoot().follow('crop').post({
            type: 'full',
            source: image.uri
        });
    }

    function canBeCropped(image) {
        // Images can only be cropped if there is a link to the crops
        // TODO: this should be an Action
        if (image.data.source.mimeType === 'image/png') {
            return $q.when(false);
        } else {
            const cropLink = image.getLink('crops').then(() => true, () => false);
            const denyLease = leaseService.deniedByCurrentLease(image);
            return Promise.resolve([denyLease, cropLink]).then((r) => {
            });
        }
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
        createFullCrop,
        canBeCropped,
        getCropsFor,
        canDeleteCrops
    };
}]);
