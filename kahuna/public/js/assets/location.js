import angular from 'angular';

export var assetLocation = angular.module('kahuna.assets.location', []);

assetLocation.filter('assetLocation', ['assetsRoot', function(assetsRoot) {
    return loc => assetsRoot + loc;
}]);
