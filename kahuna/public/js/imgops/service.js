import angular from 'angular';

export var imgops = angular.module('kahuna.imgops', []);

imgops.factory('imgops', ['$window', function($window) {
    var quality = 85;

    var getUri = image => {
        var { width: w, height: h } = $window.screen;

        return image.follow('optimised', { w, h, q: quality }).getUri().catch(() => {
            return image.source.secureUrl || image.source.file;
        });
    };

    return { getUri };

}]);
