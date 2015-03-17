import angular from 'angular';

var image = angular.module('kahuna.image.controller', []);

image.controller('ImageCtrl',
                 ['$rootScope', 'image', 'optimisedImageUri', 'cropKey', 'mediaCropper',
                  function($rootScope, image, optimisedImageUri, cropKey, mediaCropper) {

    var ctrl = this;

    ctrl.image = image;
    ctrl.optimisedImageUri = optimisedImageUri;
    // TODO: we should be able to rely on ctrl.crop.id instead once
    // all existing crops are migrated to have an id (they didn't
    // initially)
    ctrl.cropKey = cropKey;

    // Alias for convenience in view
    ctrl.metadata = image.data.metadata;

    // Map of metadata location field to query filter name
    ctrl.locationFieldMap = {
        'subLocation': 'location',
        'city':        'city',
        'state':       'state',
        'country':     'country'
    };

    ctrl.isUsefulMetadata = isUsefulMetadata;
    ctrl.cropSelected = cropSelected;

    mediaCropper.getCropsFor(image).then(crops => {
        ctrl.crops = crops;
        ctrl.crop = crops.find(crop => crop.id === cropKey);
    });

    var ignoredMetadata = [
        'title', 'description', 'copyright', 'keywords', 'byline',
        'credit', 'subLocation', 'city', 'state', 'country',
        'dateTaken'
    ];
    function isUsefulMetadata(metadataKey) {
        return ignoredMetadata.indexOf(metadataKey) === -1;
    }

    function cropSelected(crop) {
        $rootScope.$emit('events:crop-selected', {
            image: ctrl.image,
            crop: crop
        });
    }
}]);
