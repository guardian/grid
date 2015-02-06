import angular from 'angular';

export var assetLocation = angular.module('kahuna.assets.location', []);

assetLocation.filter('assetLocation', ['assetRoot', function(assetRoot) {
    return loc => assetsRoot + loc;
}]);
