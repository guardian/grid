import angular from 'angular';

var image = angular.module('kahuna.image.controller', []);

image.controller('ImageCtrl',
                 ['$scope', '$stateParams', 'mediaApi', 'mediaCropper',
                  function($scope, $stateParams, mediaApi, mediaCropper) {

    var imageId = $stateParams.imageId;
    $scope.cropKey = $stateParams.crop;

    mediaApi.find(imageId).then(image => {
        $scope.image = image;

        // FIXME: we need not to use imageSync but find a way to use the promised URI
        image.uri.then(uri => $scope.imageSync = {uri: uri, data: image.data});

        mediaCropper.getCropsFor(image).then(crops => {
           $scope.crops = crops;
           $scope.crop = crops.find(crop => crop.id === $scope.cropKey);
        });
    });

    var ignoredMetadata = [
        'title', 'description', 'copyright', 'keywords', 'byline',
        'credit', 'subLocation', 'city', 'state', 'country',
        'dateTaken'
    ];
    $scope.isUsefulMetadata = function(metadataKey) {
        return ignoredMetadata.indexOf(metadataKey) === -1;
    };

    this.cropSelected = (crop) => {
        $scope.$emit('events:crop-selected', {
            image: $scope.image,
            crop: crop
        });
    }
}]);
